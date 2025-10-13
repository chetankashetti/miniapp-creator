import { NextRequest, NextResponse } from 'next/server';
import { updateGeneratedFile, updatePreviewFiles } from '../../../lib/previewManager';
import { db, projects } from '../../../db';
import { eq } from 'drizzle-orm';
import { getUserBySessionToken } from '../../../lib/database';

// Validate manifest structure
function validateManifest(manifest: unknown): { valid: boolean; error?: string } {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, error: 'Manifest must be an object' };
  }

  const manifestObj = manifest as Record<string, unknown>;

  // Check for required top-level fields
  if (!manifestObj.accountAssociation) {
    return { valid: false, error: 'Missing required field: accountAssociation' };
  }

  // Check for either miniapp or frame field
  if (!manifestObj.miniapp && !manifestObj.frame) {
    return { valid: false, error: 'Manifest must contain either "miniapp" or "frame" field' };
  }

  // Validate accountAssociation structure
  const accountAssociation = manifestObj.accountAssociation as Record<string, unknown>;
  if (!accountAssociation.header || !accountAssociation.payload || !accountAssociation.signature) {
    return { valid: false, error: 'accountAssociation must contain header, payload, and signature' };
  }

  // Validate miniapp required fields if present
  if (manifestObj.miniapp) {
    const miniapp = manifestObj.miniapp as Record<string, unknown>;
    const requiredFields = ['version', 'name', 'iconUrl', 'homeUrl'];

    for (const field of requiredFields) {
      if (!miniapp[field]) {
        return { valid: false, error: `Missing required field in miniapp: ${field}` };
      }
    }
  }

  // Validate frame required fields if present
  if (manifestObj.frame) {
    const frame = manifestObj.frame as Record<string, unknown>;
    const requiredFields = ['version', 'name', 'iconUrl', 'homeUrl'];

    for (const field of requiredFields) {
      if (!frame[field]) {
        return { valid: false, error: `Missing required field in frame: ${field}` };
      }
    }
  }

  return { valid: true };
}

// POST: Publish manifest
export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const { projectId, manifest } = await req.json();

    console.log('📤 Publish request received:', { projectId, hasManifest: !!manifest });

    // Validate required fields
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'Missing projectId' },
        { status: 400 }
      );
    }

    if (!manifest) {
      return NextResponse.json(
        { success: false, error: 'Missing manifest' },
        { status: 400 }
      );
    }

    // Verify session token
    const authHeader = req.headers.get('authorization');
    const sessionToken = authHeader?.replace('Bearer ', '');

    if (!sessionToken) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization token' },
        { status: 401 }
      );
    }

    // Verify session token and get user
    const user = await getUserBySessionToken(sessionToken);

    if (!user) {
      console.error('❌ Session verification failed: Invalid or expired token');
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    // Check if session is expired
    if (user.expiresAt && new Date() > new Date(user.expiresAt)) {
      console.error('❌ Session expired');
      return NextResponse.json(
        { success: false, error: 'Session expired' },
        { status: 401 }
      );
    }

    const userId = user.id;
    console.log('✅ Session verified for user:', userId);

    // Validate manifest structure
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      console.error('❌ Manifest validation failed:', validation.error);
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    console.log('✅ Manifest validation passed');

    // Check if project exists and belongs to user
    const projectRecords = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);

    if (projectRecords.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const project = projectRecords[0];

    if (project.userId !== userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Project does not belong to user' },
        { status: 403 }
      );
    }

    console.log('✅ Project ownership verified');

    // Create farcaster.json content
    const farcasterJsonContent = JSON.stringify(manifest, null, 2);
    const filename = 'public/.well-known/farcaster.json';

    // Update file in generated directory
    try {
      await updateGeneratedFile(projectId, filename, farcasterJsonContent);
      console.log('✅ File saved to generated directory:', filename);
    } catch (error) {
      console.error('❌ Failed to save file locally:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save manifest file' },
        { status: 500 }
      );
    }

    // Update database
    try {
      await db
        .update(projects)
        .set({
          farcasterManifest: manifest,
          publishedAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      console.log('✅ Database updated with manifest');
    } catch (error) {
      console.error('❌ Failed to update database:', error);
      return NextResponse.json(
        { success: false, error: 'Failed to save manifest to database' },
        { status: 500 }
      );
    }

    // Trigger preview update (optional - may not work on Railway)
    try {
      await updatePreviewFiles(
        projectId,
        [{ filename, content: farcasterJsonContent }],
        sessionToken
      );
      console.log('✅ Preview updated with manifest file');
    } catch (error) {
      console.warn('⚠️ Failed to update preview (this is expected on Railway):', error);
      // Don't fail the request - preview updates are optional
    }

    // Build manifest URL
    const projectUrl = project.previewUrl || project.vercelUrl || `http://localhost:3000`;
    const manifestUrl = `${projectUrl}/.well-known/farcaster.json`;

    console.log('✅ Publish successful:', { projectId, manifestUrl });

    return NextResponse.json({
      success: true,
      manifestUrl,
      projectId,
      message: 'Manifest published successfully'
    });

  } catch (error) {
    console.error('❌ Publish error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to publish manifest'
      },
      { status: 500 }
    );
  }
}
