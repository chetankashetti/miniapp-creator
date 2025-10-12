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

  // Find all contract address constants in the file
  // Pattern matches: export const SOME_CONTRACT_ADDRESS = '0x0000...' as `0x${string}`;
  const addressPattern = /export\s+const\s+([A-Z_]+_ADDRESS)\s*=\s*['"`]0x0+['"`]\s*as\s*`0x\$\{string\}`/g;

  let match;
  const matches: Array<{ fullMatch: string; constantName: string; position: number }> = [];

  while ((match = addressPattern.exec(contractFileContent)) !== null) {
    matches.push({
      fullMatch: match[0],
      constantName: match[1],
      position: match.index
    });
  }

  console.log(`🔍 Found ${matches.length} contract address constants to potentially update`);

  // Process each match and try to find corresponding deployed address
  for (const matchInfo of matches) {
    const constantName = matchInfo.constantName;

    // Extract contract name from constant name
    // Examples:
    // - POLLS_CONTRACT_ADDRESS -> PollsContract
    // - ERC20_TOKEN_ADDRESS -> ERC20Token
    // - ESCROW_ADDRESS -> Escrow
    const contractName = extractContractNameFromConstant(constantName);

    console.log(`  📝 Constant: ${constantName} -> Potential contract: ${contractName}`);

    // Try to find deployed address
    let deployedAddress: string | null = null;

    // Try exact match first
    if (contractAddresses[contractName]) {
      deployedAddress = contractAddresses[contractName];
      console.log(`    ✅ Found exact match: ${contractName} -> ${deployedAddress}`);
    } else {
      // Try fuzzy matching (case-insensitive, handle variations)
      const contractNameLower = contractName.toLowerCase();
      for (const [name, address] of Object.entries(contractAddresses)) {
        if (name.toLowerCase() === contractNameLower ||
            name.toLowerCase().replace(/contract$/, '') === contractNameLower ||
            contractNameLower.replace(/contract$/, '') === name.toLowerCase()) {
          deployedAddress = address;
          console.log(`    ✅ Found fuzzy match: ${name} -> ${deployedAddress}`);
          break;
        }
      }
    }

    if (deployedAddress) {
      // Validate address format
      if (!isValidEthereumAddress(deployedAddress)) {
        console.warn(`    ⚠️  Invalid address format: ${deployedAddress}, skipping`);
        continue;
      }

      // Replace the placeholder address with the deployed address
      const newConstantDeclaration = `export const ${constantName} = '${deployedAddress}' as \`0x\${string}\``;
      updatedContent = updatedContent.replace(matchInfo.fullMatch, newConstantDeclaration);

      console.log(`    ✅ Injected: ${constantName} = ${deployedAddress}`);
    } else {
      console.log(`    ⚠️  No deployed address found for ${contractName}`);
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
        console.log(`ℹ️  No changes needed for ${file.filename}`);
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
