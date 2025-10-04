/**
 * End-to-End Test Script for App Generation Flow
 * Tests both initial generation (POST) and follow-up changes (PATCH)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';

// Generate a valid UUID v4 for test user
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

// Test configuration
const TEST_CONFIG = {
  // Initial generation test
  initialPrompt: "Create a simple todo list app with add and delete functionality",

  // Follow-up change test
  followUpPrompt: "Add a checkbox to mark todos as complete",

  // Alternative follow-up (diff-based)
  diffBasedPrompt: "Change the title color to blue and add a reset button",
};

// Helper: Make authenticated API request
async function makeRequest(method, endpoint, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add auth bypass header if enabled
  if (BYPASS_AUTH) {
    headers['X-Bypass-Auth'] = 'true';
    headers['X-Test-User-Id'] = TEST_USER_ID;
  }

  const options = {
    method,
    headers,
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${endpoint}`, options);
  const data = await response.json();

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

// Test 1: Initial App Generation (POST)
async function testInitialGeneration() {
  console.log('\n📦 TEST 1: Initial App Generation (POST /api/generate)');
  console.log('='.repeat(60));

  try {
    console.log(`📋 Prompt: ${TEST_CONFIG.initialPrompt}`);
    console.log(`📋 Using Multi-Stage Pipeline`);

    const response = await makeRequest('POST', '/api/generate', {
      prompt: TEST_CONFIG.initialPrompt,
      useMultiStage: true,
    });

    if (!response.ok) {
      console.error('❌ Initial generation failed!');
      console.error('📊 Status:', response.status);
      console.error('📊 Response:', JSON.stringify(response.data, null, 2));

      // Log specific error details
      if (response.data.error) {
        console.error('🔴 Error:', response.data.error);
      }
      if (response.data.details) {
        console.error('🔴 Details:', response.data.details);
      }
      if (response.data.stack) {
        console.error('🔴 Stack:', response.data.stack);
      }

      return null;
    }

    console.log('✅ Initial generation successful!');
    console.log('📊 Response:', {
      projectId: response.data.projectId,
      url: response.data.url,
      previewUrl: response.data.previewUrl,
      vercelUrl: response.data.vercelUrl,
      totalFiles: response.data.totalFiles,
      pipeline: response.data.pipeline,
      changesApplied: response.data.changesApplied,
    });

    // Verify required fields
    if (!response.data.projectId) {
      console.error('❌ Missing projectId in response');
      return null;
    }

    if (!response.data.url && !response.data.previewUrl) {
      console.error('❌ Missing preview URL in response');
      return null;
    }

    console.log('\n📝 Generated files:', response.data.generatedFiles?.slice(0, 5) || 'Not available');

    return response.data;
  } catch (error) {
    console.error('❌ Test failed with exception!');
    console.error('🔴 Error message:', error.message);
    console.error('🔴 Error stack:', error.stack);
    return null;
  }
}

// Test 2: Follow-up Changes (PATCH - Enhanced Pipeline)
async function testFollowUpChanges(projectId) {
  console.log('\n🔄 TEST 2: Follow-up Changes (PATCH /api/generate - Enhanced)');
  console.log('='.repeat(60));

  try {
    console.log(`📋 Project ID: ${projectId}`);
    console.log(`📋 Prompt: ${TEST_CONFIG.followUpPrompt}`);
    console.log(`📋 Using Enhanced Pipeline (useDiffBased: false)`);

    const response = await makeRequest('PATCH', '/api/generate', {
      projectId,
      prompt: TEST_CONFIG.followUpPrompt,
      useDiffBased: false, // Use enhanced pipeline
    });

    if (!response.ok) {
      console.error('❌ Follow-up changes failed!');
      console.error('📊 Status:', response.status);
      console.error('📊 Response:', JSON.stringify(response.data, null, 2));

      // Log specific error details
      if (response.data.error) {
        console.error('🔴 Error:', response.data.error);
      }
      if (response.data.details) {
        console.error('🔴 Details:', response.data.details);
      }
      if (response.data.stack) {
        console.error('🔴 Stack:', response.data.stack);
      }

      return false;
    }

    console.log('✅ Follow-up changes successful!');
    console.log('📊 Response:', {
      success: response.data.success,
      changedFiles: response.data.changed?.length || 0,
      previewUrl: response.data.previewUrl,
      vercelUrl: response.data.vercelUrl,
    });

    console.log('\n📝 Changed files:', response.data.changed?.slice(0, 5) || 'Not available');

    return true;
  } catch (error) {
    console.error('❌ Test failed with exception!');
    console.error('🔴 Error message:', error.message);
    console.error('🔴 Error stack:', error.stack);
    return false;
  }
}

// Test 3: Diff-based Changes (PATCH - Diff Pipeline)
async function testDiffBasedChanges(projectId) {
  console.log('\n🔄 TEST 3: Diff-based Changes (PATCH /api/generate - Diff-based)');
  console.log('='.repeat(60));

  try {
    console.log(`📋 Project ID: ${projectId}`);
    console.log(`📋 Prompt: ${TEST_CONFIG.diffBasedPrompt}`);
    console.log(`📋 Using Diff-Based Pipeline (useDiffBased: true)`);

    const response = await makeRequest('PATCH', '/api/generate', {
      projectId,
      prompt: TEST_CONFIG.diffBasedPrompt,
      useDiffBased: true, // Use diff-based pipeline
    });

    if (!response.ok) {
      console.error('❌ Diff-based changes failed!');
      console.error('📊 Status:', response.status);
      console.error('📊 Response:', JSON.stringify(response.data, null, 2));

      // Log specific error details
      if (response.data.error) {
        console.error('🔴 Error:', response.data.error);
      }
      if (response.data.details) {
        console.error('🔴 Details:', response.data.details);
      }
      if (response.data.stack) {
        console.error('🔴 Stack:', response.data.stack);
      }

      return false;
    }

    console.log('✅ Diff-based changes successful!');
    console.log('📊 Response:', {
      success: response.data.success,
      files: response.data.files?.length || 0,
      diffs: response.data.diffs?.length || 0,
      patchId: response.data.patchId,
      previewUrl: response.data.previewUrl,
      vercelUrl: response.data.vercelUrl,
    });

    console.log('\n📝 Diffs applied:', response.data.diffs?.slice(0, 3) || 'Not available');

    return true;
  } catch (error) {
    console.error('❌ Test failed with exception!');
    console.error('🔴 Error message:', error.message);
    console.error('🔴 Error stack:', error.stack);
    return false;
  }
}

// Test 4: Streaming Response (PATCH - Chat mode)
async function testStreamingResponse(projectId) {
  console.log('\n💬 TEST 4: Streaming Response (PATCH /api/generate - Chat mode)');
  console.log('='.repeat(60));

  try {
    console.log(`📋 Project ID: ${projectId}`);
    console.log(`📋 Testing streaming chat response`);

    const headers = {
      'Content-Type': 'application/json',
    };

    if (BYPASS_AUTH) {
      headers['X-Bypass-Auth'] = 'true';
      headers['X-Test-User-Id'] = TEST_USER_ID;
    }

    const response = await fetch(`${API_BASE}/api/generate`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        projectId,
        prompt: "What changes would you suggest to improve the user experience?",
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error('❌ Streaming response failed!');
      console.error('📊 Status:', response.status);

      // Try to read error body
      try {
        const errorData = await response.json();
        console.error('📊 Error response:', JSON.stringify(errorData, null, 2));
      } catch {
        const errorText = await response.text();
        console.error('📊 Error response:', errorText);
      }

      return false;
    }

    console.log('✅ Streaming started...');

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      fullResponse += chunk;
      process.stdout.write(chunk);
    }

    console.log('\n\n✅ Streaming completed');
    console.log(`📊 Total response length: ${fullResponse.length} chars`);

    return true;
  } catch (error) {
    console.error('❌ Test failed with exception!');
    console.error('🔴 Error message:', error.message);
    console.error('🔴 Error stack:', error.stack);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n🚀 Starting End-to-End Generation Flow Tests');
  console.log('='.repeat(60));
  console.log(`API Base: ${API_BASE}`);
  console.log(`Auth Bypass: ${BYPASS_AUTH ? 'ENABLED' : 'DISABLED'}`);
  console.log('='.repeat(60));

  const results = {
    initialGeneration: false,
    followUpChanges: false,
    diffBasedChanges: false,
    streamingResponse: false,
  };

  // Test 1: Initial Generation
  const projectData = await testInitialGeneration();
  results.initialGeneration = projectData !== null;

  if (!projectData) {
    console.error('\n❌ Cannot proceed with follow-up tests - initial generation failed');
    printSummary(results);
    process.exit(1);
  }

  const { projectId } = projectData;

  // Wait a bit for the project to be ready
  console.log('\n⏳ Waiting 3 seconds for project to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Follow-up Changes (Enhanced Pipeline)
  results.followUpChanges = await testFollowUpChanges(projectId);

  // Wait before next test
  console.log('\n⏳ Waiting 2 seconds before next test...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Diff-based Changes
  results.diffBasedChanges = await testDiffBasedChanges(projectId);

  // Wait before streaming test
  console.log('\n⏳ Waiting 2 seconds before streaming test...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: Streaming Response
  results.streamingResponse = await testStreamingResponse(projectId);

  // Print summary
  printSummary(results);

  // Exit with appropriate code
  const allPassed = Object.values(results).every(r => r === true);
  process.exit(allPassed ? 0 : 1);
}

function printSummary(results) {
  console.log('\n\n📊 TEST SUMMARY');
  console.log('='.repeat(60));

  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${test}: ${status}`);
  });

  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r === true).length;
  const failed = total - passed;

  console.log('='.repeat(60));
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
