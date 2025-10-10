import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken } from '@/lib/auth';
import { db, projects, projectFiles } from '@/db';
import { eq, and } from 'drizzle-orm';
import { updateGeneratedFile, updatePreviewFiles } from '@/lib/previewManager';

// Validate Farcaster manifest structure
function validateManifest(manifest: unknown): { valid: boolean; error?: string } {
  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, error: 'Manifest must be a valid JSON object' };
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
    return {
      valid: false,
      error: 'accountAssociation must contain header, payload, and signature fields'
    };
  }

  // Validate miniapp structure if present
  if (manifestObj.miniapp) {
    const miniapp = manifestObj.miniapp as Record<string, unknown>;
    const requiredFields = ['version', 'name', 'iconUrl', 'homeUrl'];

    for (const field of requiredFields) {
      if (!miniapp[field]) {
        return {
          valid: false,
          error: `Missing required field in miniapp: ${field}`
        };
      }
    }
  }

  // Validate frame structure if present
  if (manifestObj.frame) {
    const frame = manifestObj.frame as Record<string, unknown>;
    const requiredFields = ['version', 'name', 'iconUrl', 'homeUrl'];

    for (const field of requiredFields) {
      if (!frame[field]) {
        return {
          valid: false,
          error: `Missing required field in frame: ${field}`
        };
      }
    }
  }

  return { valid: true };
}

// POST /api/publish - Publish Farcaster manifest for a project
export async function POST(req: NextRequest) {
  try {
    // Verify session token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const sessionToken = authHeader.substring(7);
    const userId = await verifySessionToken(sessionToken);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid session token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { projectId, manifest } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId' },
        { status: 400 }
      );
    }

    if (!manifest) {
      return NextResponse.json(
        { error: 'Missing manifest' },
        { status: 400 }
      );
    }

    // Validate manifest structure
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return NextResponse.json(
        { error: `Invalid manifest: ${validation.error}` },
        { status: 400 }
      );
    }

    // Check if project exists and belongs to user
    const [project] = await db.select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Create the farcaster.json content
    const farcasterJsonContent = JSON.stringify(manifest, null, 2);

    // Update the file in the generated directory
    await updateGeneratedFile(
      projectId,
      'public/.well-known/farcaster.json',
      farcasterJsonContent
    );

    // Update project in database with manifest
    await db.update(projects)
      .set({
        farcasterManifest: manifest,
        publishedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(projects.id, projectId));

    // Create/update the file in database
    const [existingFile] = await db.select()
      .from(projectFiles)
      .where(and(
        eq(projectFiles.projectId, projectId),
        eq(projectFiles.filename, 'public/.well-known/farcaster.json')
      ));

    if (existingFile) {
      await db.update(projectFiles)
        .set({
          content: farcasterJsonContent,
          updatedAt: new Date()
        })
        .where(eq(projectFiles.id, existingFile.id));
    } else {
      await db.insert(projectFiles).values({
        projectId: projectId,
        filename: 'public/.well-known/farcaster.json',
        content: farcasterJsonContent
      });
    }

    // Trigger preview update to deploy the new file
    try {
      await updatePreviewFiles(
        projectId,
        [{ filename: 'public/.well-known/farcaster.json', content: farcasterJsonContent }],
        sessionToken
      );
    } catch (error) {
      console.error('Failed to update preview:', error);
      // Don't fail the request if preview update fails
    }

    const manifestUrl = `${project.previewUrl || project.vercelUrl}/.well-known/farcaster.json`;

    return NextResponse.json({
      success: true,
      message: 'Manifest published successfully',
      manifestUrl: manifestUrl
    });

  } catch (error) {
    console.error('Error publishing manifest:', error);
    return NextResponse.json(
      { error: 'Failed to publish manifest' },
      { status: 500 }
    );
  }
}

// GET /api/publish - Get published manifest for a project
export async function GET(req: NextRequest) {
  try {
    // Verify session token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const sessionToken = authHeader.substring(7);
    const userId = await verifySessionToken(sessionToken);
    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid session token' },
        { status: 401 }
      );
    }

    // Get projectId from query params
    const searchParams = req.nextUrl.searchParams;
    const projectId = searchParams.get('projectId');

    if (!projectId) {
      return NextResponse.json(
        { error: 'Missing projectId' },
        { status: 400 }
      );
    }

    // Check if project exists and belongs to user
    const [project] = await db.select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, userId)));

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Return manifest if exists
    if (project.farcasterManifest) {
      const manifestUrl = `${project.previewUrl || project.vercelUrl}/.well-known/farcaster.json`;

      return NextResponse.json({
        manifest: project.farcasterManifest,
        publishedAt: project.publishedAt,
        manifestUrl: manifestUrl
      });
    }

    return NextResponse.json({
      manifest: null,
      message: 'No manifest published for this project'
    });

  } catch (error) {
    console.error('Error fetching manifest:', error);
    return NextResponse.json(
      { error: 'Failed to fetch manifest' },
      { status: 500 }
    );
  }
}
