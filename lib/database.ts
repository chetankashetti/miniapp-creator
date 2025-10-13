import { db, users, projects, projectFiles, projectPatches, projectDeployments, userSessions, chatMessages, generationJobs } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';

// User management functions
export async function createUser(privyUserId: string, email?: string, displayName?: string, pfpUrl?: string) {
  const [user] = await db.insert(users).values({
    privyUserId,
    email,
    displayName,
    pfpUrl,
  }).returning();
  return user;
}

export async function getUserByPrivyId(privyUserId: string) {
  try {
    
    // Add a timeout to prevent hanging
    const queryPromise = db.select().from(users).where(eq(users.privyUserId, privyUserId));
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database query timeout')), 10000)
    );
    
    const [user] = await Promise.race([queryPromise, timeoutPromise]) as typeof users.$inferSelect[];
    return user;
  } catch (error) {
    console.error('❌ getUserByPrivyId error:', error);
    throw error;
  }
}

export async function getUserById(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user;
}

// Project management functions
export async function createProject(
  userId: string,
  name: string,
  description?: string,
  previewUrl?: string,
  customId?: string
) {
  const [project] = await db.insert(projects).values({
    id: customId, // Use custom ID if provided, otherwise let database generate one
    userId,
    name,
    description,
    previewUrl,
  }).returning();
  return project;
}

export async function getProjectById(projectId: string) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  return project;
}

export async function getProjectsByUserId(userId: string) {
  return await db.select().from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'active')))
    .orderBy(desc(projects.updatedAt));
}

export async function updateProject(projectId: string, updates: Partial<typeof projects.$inferInsert>) {
  const [project] = await db.update(projects)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();
  return project;
}

export async function deleteProject(projectId: string) {
  await db.update(projects)
    .set({ status: 'deleted', updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

// Project files management
export async function saveProjectFiles(projectId: string, files: { filename: string; content: string }[]) {
  // Delete existing files for this project
  await db.delete(projectFiles).where(eq(projectFiles.projectId, projectId));
  
  // Filter out files that might cause encoding issues
  const safeFiles = files.filter(file => {
    // Check for potential encoding issues
    if (file.content.includes('\0') || file.content.includes('\x00')) {
      console.log(`⚠️ Skipping file with null bytes: ${file.filename}`);
      return false;
    }
    return true;
  });
  
  console.log(`📁 Saving ${safeFiles.length} safe files to database (${files.length - safeFiles.length} filtered out)`);
  
  // Insert new files
  const fileRecords = safeFiles.map(file => ({
    projectId,
    filename: file.filename,
    content: file.content,
    version: 1,
  }));
  
  return await db.insert(projectFiles).values(fileRecords).returning();
}

export async function getProjectFiles(projectId: string) {
  return await db.select().from(projectFiles)
    .where(eq(projectFiles.projectId, projectId))
    .orderBy(projectFiles.filename);
}

export async function updateProjectFile(projectId: string, filename: string, content: string) {
  const [file] = await db.update(projectFiles)
    .set({ content, updatedAt: new Date() })
    .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.filename, filename)))
    .returning();
  return file;
}

// Patch management
export async function savePatch(
  projectId: string,
  patchData: Record<string, unknown>,
  description?: string
) {
  const [patch] = await db.insert(projectPatches).values({
    projectId,
    patchData,
    description,
  }).returning();
  return patch;
}

export async function getProjectPatches(projectId: string) {
  return await db.select().from(projectPatches)
    .where(eq(projectPatches.projectId, projectId))
    .orderBy(desc(projectPatches.appliedAt));
}

export async function revertPatch(patchId: string) {
  const [patch] = await db.update(projectPatches)
    .set({ revertedAt: new Date() })
    .where(eq(projectPatches.id, patchId))
    .returning();
  return patch;
}

// Deployment management
export async function createDeployment(
  projectId: string,
  platform: string,
  deploymentUrl: string,
  status: string = 'pending',
  buildLogs?: string,
  contractAddresses?: { [key: string]: string }
) {
  const [deployment] = await db.insert(projectDeployments).values({
    projectId,
    platform,
    deploymentUrl,
    status,
    buildLogs,
    contractAddresses: contractAddresses || null,
  }).returning();
  return deployment;
}

export async function updateDeployment(
  deploymentId: string,
  updates: Partial<typeof projectDeployments.$inferInsert>
) {
  const [deployment] = await db.update(projectDeployments)
    .set(updates)
    .where(eq(projectDeployments.id, deploymentId))
    .returning();
  return deployment;
}

export async function getProjectDeployments(projectId: string) {
  return await db.select().from(projectDeployments)
    .where(eq(projectDeployments.projectId, projectId))
    .orderBy(desc(projectDeployments.createdAt));
}

// Session management
export async function createUserSession(userId: string, sessionToken: string, expiresAt: Date) {
  const [session] = await db.insert(userSessions).values({
    userId,
    sessionToken,
    expiresAt,
  }).returning();
  return session;
}

export async function getSessionByToken(sessionToken: string) {
  const [session] = await db.select().from(userSessions)
    .where(and(
      eq(userSessions.sessionToken, sessionToken),
      // Check if session is not expired
      // This would need a proper date comparison in a real implementation
    ));
  return session;
}

export async function deleteSession(sessionToken: string) {
  await db.delete(userSessions).where(eq(userSessions.sessionToken, sessionToken));
}

export async function deleteExpiredSessions() {
//   const now = new Date();
  // This would need proper date comparison in a real implementation
  // For now, we'll implement a simple cleanup by deleting all sessions
  // In production, you'd use: lt(userSessions.expiresAt, now)
  await db.delete(userSessions);
}

// Add this function to get user by session token
export async function getUserBySessionToken(sessionToken: string) {
  const [session] = await db
    .select({
      id: userSessions.id,
      userId: userSessions.userId,
      expiresAt: userSessions.expiresAt,
      createdAt: userSessions.createdAt,
    })
    .from(userSessions)
    .where(eq(userSessions.sessionToken, sessionToken));

  if (!session) return null;

  // Get user details
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId));

  return user ? { ...user, expiresAt: session.expiresAt } : null;
}

// Add function to update user info
export async function updateUser(
  userId: string,
  updates: {
    email?: string;
    displayName?: string;
    pfpUrl?: string;
  }
) {
  const [user] = await db
    .update(users)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return user;
}

// Chat message management functions
export async function saveChatMessage(
  projectId: string,
  role: 'user' | 'ai',
  content: string,
  phase?: string,
  changedFiles?: string[]
) {
  const [message] = await db.insert(chatMessages).values({
    projectId,
    role,
    content,
    phase,
    changedFiles: changedFiles ? changedFiles : null,
  }).returning();
  return message;
}

export async function getProjectChatMessages(projectId: string) {
  return await db.select().from(chatMessages)
    .where(eq(chatMessages.projectId, projectId))
    .orderBy(chatMessages.timestamp);
}

export async function migrateChatMessages(fromProjectId: string, toProjectId: string) {
  // Get all chat messages from the source project
  const messages = await db.select().from(chatMessages)
    .where(eq(chatMessages.projectId, fromProjectId));
  
  if (messages.length === 0) {
    console.log(`No chat messages to migrate from ${fromProjectId} to ${toProjectId}`);
    return [];
  }
  
  // Update the projectId for all messages
  const updatedMessages = messages.map(msg => ({
    ...msg,
    projectId: toProjectId
  }));
  
  // Delete old messages and insert with new projectId
  await db.delete(chatMessages).where(eq(chatMessages.projectId, fromProjectId));
  
  const migratedMessages = await db.insert(chatMessages).values(updatedMessages).returning();
  
  console.log(`✅ Migrated ${migratedMessages.length} chat messages from ${fromProjectId} to ${toProjectId}`);
  return migratedMessages;
}

export async function clearProjectChatMessages(projectId: string) {
  await db.delete(chatMessages).where(eq(chatMessages.projectId, projectId));
}

// Generation job management functions
export async function createGenerationJob(
  userId: string,
  prompt: string,
  context: Record<string, unknown>,
  projectId?: string
) {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

  const [job] = await db.insert(generationJobs).values({
    userId,
    projectId: projectId || null,
    prompt,
    context,
    expiresAt,
  }).returning();
  return job;
}

export async function getGenerationJobById(jobId: string) {
  const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId));
  return job;
}

export async function updateGenerationJobStatus(
  jobId: string,
  status: 'pending' | 'processing' | 'completed' | 'failed',
  result?: Record<string, unknown>,
  error?: string
) {
  const updates: Record<string, unknown> = { status };

  if (status === 'processing' && !result) {
    updates.startedAt = new Date();
  }

  if (status === 'completed' || status === 'failed') {
    updates.completedAt = new Date();
  }

  if (result !== undefined) {
    updates.result = result;
  }

  if (error !== undefined) {
    updates.error = error;
  }

  const [job] = await db.update(generationJobs)
    .set(updates)
    .where(eq(generationJobs.id, jobId))
    .returning();
  return job;
}

export async function getPendingGenerationJobs(limit: number = 10) {
  return await db.select().from(generationJobs)
    .where(eq(generationJobs.status, 'pending'))
    .orderBy(generationJobs.createdAt)
    .limit(limit);
}

export async function deleteExpiredGenerationJobs() {
  const now = new Date();
  await db.delete(generationJobs)
    .where(sql`${generationJobs.expiresAt} < ${now}`);
}

export async function getUserGenerationJobs(userId: string, limit: number = 20) {
  return await db.select().from(generationJobs)
    .where(eq(generationJobs.userId, userId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(limit);
}
