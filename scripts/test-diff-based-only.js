/**
 * Focused Test Script for Diff-Based Pipeline Only
 * Tests only the diff-based follow-up changes (useDiffBased: true)
 */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';

// Generate a valid UUID v4 for test user
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';

// Helper: Make authenticated API request
async function makeRequest(method, endpoint, body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };

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

// Test 1: Initial App Generation
async function testInitialGeneration() {
  console.log('\n📦 TEST 1: Initial App Generation');
  console.log('='.repeat(60));

  const prompt = "Create a simple counter app with increment and decrement buttons";

  try {
    console.log(`📋 Prompt: ${prompt}`);

    const response = await makeRequest('POST', '/api/generate', {
      prompt,
      useMultiStage: true,
    });

    if (!response.ok) {
      console.error('❌ Initial generation failed!');
      console.error('📊 Response:', JSON.stringify(response.data, null, 2));
      return null;
    }

    console.log('✅ Initial generation successful!');
    console.log('📊 Project ID:', response.data.projectId);
    console.log('📊 Preview URL:', response.data.previewUrl);

    return response.data;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return null;
  }
}

// Test 2: Diff-Based Change - Add Feature
async function testDiffBasedAddFeature(projectId) {
  console.log('\n🔄 TEST 2: Diff-Based Change - Add Reset Button');
  console.log('='.repeat(60));

  const prompt = "Add a reset button that sets the counter back to 0";

  try {
    console.log(`📋 Project ID: ${projectId}`);
    console.log(`📋 Prompt: ${prompt}`);
    console.log(`📋 Using Diff-Based Pipeline (useDiffBased: true)`);

    const response = await makeRequest('PATCH', '/api/generate', {
      projectId,
      prompt,
      useDiffBased: true,
    });

    if (!response.ok) {
      console.error('❌ Diff-based change failed!');
      console.error('📊 Response:', JSON.stringify(response.data, null, 2));
      return false;
    }

    console.log('✅ Diff-based change successful!');
    console.log('📊 Files changed:', response.data.files?.length || 0);
    console.log('📊 Diffs applied:', response.data.diffs?.length || 0);
    console.log('📊 Changed files:', response.data.files?.map(f => f.filename).join(', '));

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Test 3: Diff-Based Change - Modify Style
async function testDiffBasedModifyStyle(projectId) {
  console.log('\n🎨 TEST 3: Diff-Based Change - Modify Styles');
  console.log('='.repeat(60));

  const prompt = "Change the counter display to have a blue color and larger font size";

  try {
    console.log(`📋 Project ID: ${projectId}`);
    console.log(`📋 Prompt: ${prompt}`);
    console.log(`📋 Using Diff-Based Pipeline (useDiffBased: true)`);

    const response = await makeRequest('PATCH', '/api/generate', {
      projectId,
      prompt,
      useDiffBased: true,
    });

    if (!response.ok) {
      console.error('❌ Diff-based change failed!');
      console.error('📊 Response:', JSON.stringify(response.data, null, 2));
      return false;
    }

    console.log('✅ Diff-based change successful!');
    console.log('📊 Files changed:', response.data.files?.length || 0);
    console.log('📊 Diffs applied:', response.data.diffs?.length || 0);

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Test 4: Diff-Based Change - Add Logic
async function testDiffBasedAddLogic(projectId) {
  console.log('\n⚡ TEST 4: Diff-Based Change - Add Double Button');
  console.log('='.repeat(60));

  const prompt = "Add a button that doubles the current counter value";

  try {
    console.log(`📋 Project ID: ${projectId}`);
    console.log(`📋 Prompt: ${prompt}`);
    console.log(`📋 Using Diff-Based Pipeline (useDiffBased: true)`);

    const response = await makeRequest('PATCH', '/api/generate', {
      projectId,
      prompt,
      useDiffBased: true,
    });

    if (!response.ok) {
      console.error('❌ Diff-based change failed!');
      console.error('📊 Response:', JSON.stringify(response.data, null, 2));
      return false;
    }

    console.log('✅ Diff-based change successful!');
    console.log('📊 Files changed:', response.data.files?.length || 0);
    console.log('📊 Diffs applied:', response.data.diffs?.length || 0);

    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Test 5: Verify Files Were Actually Updated
async function verifyFilesUpdated(projectId) {
  console.log('\n✓ TEST 5: Verify Files Were Updated');
  console.log('='.repeat(60));

  const fs = require('fs');
  const path = require('path');

  const projectDir = path.join(__dirname, '..', 'generated', projectId, 'src', 'app');
  const pageFile = path.join(projectDir, 'page.tsx');

  try {
    if (!fs.existsSync(pageFile)) {
      console.error('❌ page.tsx file not found!');
      return false;
    }

    const content = fs.readFileSync(pageFile, 'utf-8');

    // Check for reset button
    const hasResetButton = content.includes('reset') || content.includes('Reset');
    console.log(hasResetButton ? '✅ Reset button found' : '❌ Reset button NOT found');

    // Check for double button
    const hasDoubleButton = content.includes('double') || content.includes('Double');
    console.log(hasDoubleButton ? '✅ Double button found' : '❌ Double button NOT found');

    // Check for blue color styling
    const hasBlueColor = content.includes('blue') || content.includes('#') || content.includes('color');
    console.log(hasBlueColor ? '✅ Color styling found' : '⚠️ Color styling might be in CSS');

    return hasResetButton && hasDoubleButton;
  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    return false;
  }
}

// Main test runner
async function runDiffBasedTests() {
  console.log('\n🚀 Starting Diff-Based Pipeline Tests');
  console.log('='.repeat(60));
  console.log(`API Base: ${API_BASE}`);
  console.log(`Auth Bypass: ${BYPASS_AUTH ? 'ENABLED' : 'DISABLED'}`);
  console.log('='.repeat(60));

  const results = {
    initialGeneration: false,
    addFeature: false,
    modifyStyle: false,
    addLogic: false,
    verification: false,
  };

  // Test 1: Initial Generation
  const projectData = await testInitialGeneration();
  results.initialGeneration = projectData !== null;

  if (!projectData) {
    console.error('\n❌ Cannot proceed - initial generation failed');
    printSummary(results);
    process.exit(1);
  }

  const { projectId } = projectData;

  // Wait for project to be ready
  console.log('\n⏳ Waiting 3 seconds for project to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 2: Add Reset Button
  results.addFeature = await testDiffBasedAddFeature(projectId);

  // Wait between tests
  console.log('\n⏳ Waiting 2 seconds before next test...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 3: Modify Styles
  results.modifyStyle = await testDiffBasedModifyStyle(projectId);

  // Wait between tests
  console.log('\n⏳ Waiting 2 seconds before next test...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 4: Add Double Button
  results.addLogic = await testDiffBasedAddLogic(projectId);

  // Wait for final changes
  console.log('\n⏳ Waiting 3 seconds for changes to be written...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Test 5: Verify Files
  results.verification = await verifyFilesUpdated(projectId);

  // Print summary
  printSummary(results);

  // Exit with appropriate code
  const allPassed = Object.values(results).every(r => r === true);
  process.exit(allPassed ? 0 : 1);
}

function printSummary(results) {
  console.log('\n\n📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const statusMap = {
    initialGeneration: 'Initial Generation',
    addFeature: 'Add Reset Button (Diff-Based)',
    modifyStyle: 'Modify Styles (Diff-Based)',
    addLogic: 'Add Double Button (Diff-Based)',
    verification: 'File Verification',
  };

  Object.entries(results).forEach(([test, passed]) => {
    const icon = passed ? '✅' : '❌';
    const status = passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${statusMap[test]}: ${status}`);
  });

  const total = Object.keys(results).length;
  const passed = Object.values(results).filter(r => r === true).length;
  const failed = total - passed;

  console.log('='.repeat(60));
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));
}

// Run tests
runDiffBasedTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
