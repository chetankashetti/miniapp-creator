/**
 * Contract Address Injector
 *
 * Automatically injects deployed contract addresses into generated project files.
 * Handles src/lib/contracts.ts and other contract configuration files.
 */

export interface ContractAddressMap {
  [contractName: string]: string; // Contract name -> deployed address
}

/**
 * Inject a single contract address using simple replace with fallback
 *
 * @param content - File content
 * @param contractAddress - Deployed contract address
 * @returns Object with updated content and success status
 */
function injectSingleContractAddress(
  content: string,
  contractAddress: string
): { updated: string; success: boolean } {

  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

  // ============================================================
  // PRIMARY: Simple Replace
  // ============================================================
  if (content.includes(ZERO_ADDRESS)) {
    const updated = content.replace(ZERO_ADDRESS, contractAddress);

    // Verify it worked
    if (updated.includes(contractAddress)) {
      console.log('✅ Contract address injected via simple replace');
      return { updated, success: true };
    }
  }

  // ============================================================
  // FALLBACK: Line-by-Line Search
  // ============================================================
  console.log('⚠️ Simple replace failed, trying fallback...');

  const lines = content.split('\n');
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('CONTRACT_ADDRESS') && lines[i].includes(ZERO_ADDRESS)) {
      lines[i] = lines[i].replace(ZERO_ADDRESS, contractAddress);
      found = true;
      console.log(`✅ Contract address injected via fallback (line ${i + 1})`);
      break; // Only replace first occurrence
    }
  }

  if (found) {
    return { updated: lines.join('\n'), success: true };
  }

  // Failed
  console.error('❌ Contract address injection failed');
  console.error('📄 File content preview:', content.substring(0, 300));
  return { updated: content, success: false };
}

/**
 * Inject contract addresses into src/lib/contracts.ts
 *
 * @param contractFileContent - Original content of src/lib/contracts.ts
 * @param contractAddresses - Map of contract names to deployed addresses
 * @returns Updated file content with injected addresses
 */
export function injectContractAddresses(
  contractFileContent: string,
  contractAddresses: ContractAddressMap
): string {
  let updatedContent = contractFileContent;

  // Get the first contract address (for simple replace approach)
  const firstContractAddress = Object.values(contractAddresses)[0];
  const firstContractName = Object.keys(contractAddresses)[0];

  if (!firstContractAddress) {
    console.warn('⚠️ No contract addresses provided');
    return contractFileContent;
  }

  console.log(`🔍 Attempting to inject contract address: ${firstContractName} -> ${firstContractAddress}`);

  // Validate address format
  if (!isValidEthereumAddress(firstContractAddress)) {
    console.error(`❌ Invalid address format: ${firstContractAddress}`);
    return contractFileContent;
  }

  // Try simple replace with fallback
  const result = injectSingleContractAddress(contractFileContent, firstContractAddress);

  if (result.success) {
    updatedContent = result.updated;
    console.log(`✅ Successfully injected ${firstContractName} address`);
  } else {
    console.error(`❌ Failed to inject ${firstContractName} address`);
  }

  // If there are multiple contracts, try to inject them too
  if (Object.keys(contractAddresses).length > 1) {
    console.log(`🔍 Found ${Object.keys(contractAddresses).length} total contracts, attempting to inject remaining...`);

    for (const [contractName, address] of Object.entries(contractAddresses)) {
      if (contractName === firstContractName) continue; // Skip first one, already done

      if (isValidEthereumAddress(address)) {
        // Try to find and replace any remaining zero addresses
        const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
        if (updatedContent.includes(ZERO_ADDRESS)) {
          updatedContent = updatedContent.replace(ZERO_ADDRESS, address);
          console.log(`✅ Injected additional contract: ${contractName} -> ${address}`);
        }
      }
    }
  }

  return updatedContent;
}

/**
 * Extract contract name from constant name
 * Examples:
 * - POLLS_CONTRACT_ADDRESS -> PollsContract
 * - ERC20_TOKEN_ADDRESS -> ERC20Token
 * - ESCROW_ADDRESS -> Escrow
 */
function extractContractNameFromConstant(constantName: string): string {
  // Remove _ADDRESS suffix
  let name = constantName.replace(/_ADDRESS$/, '');

  // Remove _CONTRACT suffix if present
  name = name.replace(/_CONTRACT$/, '');

  // Convert SNAKE_CASE to PascalCase
  const parts = name.split('_');
  const pascalCase = parts
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');

  // Add Contract suffix for common patterns
  if (!pascalCase.endsWith('Contract') &&
      !pascalCase.startsWith('ERC') &&
      !['Token', 'Escrow', 'NFT', 'DAO'].some(suffix => pascalCase.endsWith(suffix))) {
    return `${pascalCase}Contract`;
  }

  return pascalCase;
}

/**
 * Validate Ethereum address format
 */
function isValidEthereumAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Update multiple files with contract addresses
 *
 * @param files - Array of project files
 * @param contractAddresses - Map of contract names to deployed addresses
 * @returns Updated files with injected addresses
 */
export function updateFilesWithContractAddresses(
  files: { filename: string; content: string }[],
  contractAddresses: ContractAddressMap
): { filename: string; content: string }[] {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🔧 INJECTING CONTRACT ADDRESSES`);
  console.log(`${"=".repeat(60)}`);
  console.log(`📋 Contract addresses to inject:`, contractAddresses);

  return files.map(file => {
    // Only process contract configuration files
    if (file.filename === 'src/lib/contracts.ts' ||
        file.filename === 'lib/contracts.ts' ||
        file.filename.includes('contractConfig')) {

      console.log(`\n📄 Processing file: ${file.filename}`);
      const updatedContent = injectContractAddresses(file.content, contractAddresses);

      if (updatedContent !== file.content) {
        console.log(`✅ Updated ${file.filename} with deployed addresses`);
        return {
          ...file,
          content: updatedContent
        };
      } else {
        console.warn(`⚠️ No changes made to ${file.filename} - check if zero address is present`);
      }
    }

    return file;
  });
}

/**
 * Parse deployment info from external API response
 *
 * The external deploy API returns contract addresses in various formats:
 * - deploymentInfo.json content
 * - Direct contractAddresses object
 * - Nested in deployment response
 */
export function parseContractAddressesFromDeployment(
  deploymentResponse: unknown
): ContractAddressMap | null {
  if (!deploymentResponse || typeof deploymentResponse !== 'object') {
    return null;
  }

  const response = deploymentResponse as Record<string, unknown>;

  // Try different possible locations for contract addresses

  // 1. Direct contractAddresses field
  if (response.contractAddresses && typeof response.contractAddresses === 'object') {
    console.log(`✅ Found contractAddresses in deployment response`);
    return response.contractAddresses as ContractAddressMap;
  }

  // 2. contractDeployment field (from external API)
  if (response.contractDeployment && typeof response.contractDeployment === 'object') {
    const contractDeployment = response.contractDeployment as Record<string, unknown>;
    const addresses: ContractAddressMap = {};

    // Extract contract addresses from contractDeployment
    // Filter out metadata fields like deployer, network, chainId, rpcUrl, timestamp, transactionHash
    const metadataFields = ['deployer', 'network', 'chainid', 'rpcurl', 'timestamp', 'transactionhash'];

    for (const [key, value] of Object.entries(contractDeployment)) {
      if (typeof value === 'string' &&
          /^0x[a-fA-F0-9]{40}$/.test(value) &&
          !metadataFields.includes(key.toLowerCase())) {
        addresses[key] = value;
        console.log(`  📝 Found contract: ${key} -> ${value}`);
      }
    }

    if (Object.keys(addresses).length > 0) {
      console.log(`✅ Extracted ${Object.keys(addresses).length} contract addresses from contractDeployment`);
      return addresses;
    }
  }

  // 3. deploymentInfo field
  if (response.deploymentInfo && typeof response.deploymentInfo === 'object') {
    const deploymentInfo = response.deploymentInfo as Record<string, unknown>;
    const addresses: ContractAddressMap = {};

    // Extract contract addresses from deploymentInfo
    for (const [key, value] of Object.entries(deploymentInfo)) {
      if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)) {
        addresses[key] = value;
      }
    }

    if (Object.keys(addresses).length > 0) {
      console.log(`✅ Extracted ${Object.keys(addresses).length} contract addresses from deploymentInfo`);
      return addresses;
    }
  }

  // 4. Look for any fields that look like Ethereum addresses
  const addresses: ContractAddressMap = {};
  for (const [key, value] of Object.entries(response)) {
    if (typeof value === 'string' &&
        /^0x[a-fA-F0-9]{40}$/.test(value) &&
        !key.toLowerCase().includes('deployer') &&
        !key.toLowerCase().includes('owner')) {
      addresses[key] = value;
    }
  }

  if (Object.keys(addresses).length > 0) {
    console.log(`✅ Found ${Object.keys(addresses).length} potential contract addresses in response`);
    return addresses;
  }

  console.log(`⚠️  No contract addresses found in deployment response`);
  return null;
}
