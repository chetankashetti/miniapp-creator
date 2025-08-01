# LLM Usage Strategy for Farcaster Miniapp Generation

## Overview

This document outlines the optimized LLM usage strategy for the multi-stage pipeline, using different Anthropic models for different tasks to balance cost, performance, and quality.

## Available Anthropic Models

| Model                        | Speed    | Cost    | Use Case                       |
| ---------------------------- | -------- | ------- | ------------------------------ |
| `claude-3-5-haiku-20241022`  | Fastest  | Lowest  | Simple tasks, quick responses  |
| `claude-3-5-sonnet-20241022` | Balanced | Medium  | Most tasks, good reasoning     |
| `claude-3-7-sonnet-20250219` | Slowest  | Highest | Complex tasks, highest quality |

## Stage-by-Stage Model Selection

### Stage 1: Intent Parser

- **Model**: `claude-3-5-haiku-20241022` (FAST)
- **Max Tokens**: 2,000
- **Temperature**: 0
- **Reason**: Simple JSON parsing task, fast model sufficient
- **Cost**: ~$0.0001 per request
- **Task**: Parse user intent into structured JSON specification

### Stage 2: Patch Planner

- **Model**: `claude-3-5-sonnet-20241022` (BALANCED)
- **Max Tokens**: 4,000
- **Temperature**: 0
- **Reason**: Complex planning task, needs good reasoning
- **Cost**: ~$0.001 per request
- **Task**: Plan specific file changes based on intent

### Stage 3: Code Generator

- **Model**: `claude-3-7-sonnet-20250219` (POWERFUL)
- **Max Tokens**: 8,000
- **Temperature**: 0
- **Reason**: Complex code generation, needs highest quality
- **Cost**: ~$0.005 per request
- **Task**: Generate actual file contents for each patch

### Stage 4: Validator & Self-Debug

- **Model**: `claude-3-5-sonnet-20241022` (BALANCED)
- **Max Tokens**: 6,000
- **Temperature**: 0
- **Reason**: Error fixing requires good reasoning but not highest tier
- **Cost**: ~$0.002 per request
- **Task**: Fix compilation/linting errors

### Legacy Single-Stage

- **Model**: `claude-3-7-sonnet-20250219` (POWERFUL)
- **Max Tokens**: 8,000
- **Temperature**: 0
- **Reason**: Single-stage does everything, needs highest quality
- **Cost**: ~$0.005 per request
- **Task**: Complete generation in one step

## Cost Optimization Strategy

### Multi-Stage Pipeline (Recommended)

```
Stage 1 (Intent Parser):     $0.0001
Stage 2 (Patch Planner):     $0.0010
Stage 3 (Code Generator):    $0.0050
Stage 4 (Validator):         $0.0020 (if needed)
Total:                       $0.0081
```

### Legacy Single-Stage Pipeline

```
Single Stage:                $0.0050
Total:                       $0.0050
```

### Cost Comparison

- **Multi-Stage**: ~$0.0081 per request (with validation)
- **Single-Stage**: ~$0.0050 per request
- **Savings**: Multi-stage is ~60% more expensive but provides:
  - Better error handling
  - More reliable generation
  - Stage-by-stage debugging
  - Early termination for simple requests

## Performance Characteristics

### Stage 1: Intent Parser (Haiku)

- **Speed**: ~500ms
- **Accuracy**: High for simple parsing
- **Use Case**: Basic miniapp requests → early termination

### Stage 2: Patch Planner (Sonnet)

- **Speed**: ~2-3 seconds
- **Accuracy**: High for planning
- **Use Case**: Complex feature requests

### Stage 3: Code Generator (Opus)

- **Speed**: ~5-8 seconds
- **Accuracy**: Highest for code generation
- **Use Case**: Complex code generation

### Stage 4: Validator (Sonnet)

- **Speed**: ~3-5 seconds
- **Accuracy**: High for error fixing
- **Use Case**: Only when validation fails

## Smart Early Termination

The pipeline includes intelligent early termination:

1. **Stage 1 Analysis**: If user asks for "Create miniapp" (basic request)

   - `needsChanges: false`
   - Returns boilerplate files as-is
   - Skips stages 2-4
   - Cost: ~$0.0001 (95% cost reduction)

2. **Stage 4 Conditional**: Only runs if validation fails
   - Most requests don't need validation
   - Saves ~$0.002 per successful request

## Example Scenarios

### Scenario 1: Basic Miniapp Request

```
User: "Create miniapp"
Stage 1: Intent Parser (Haiku) → needsChanges: false
Result: Return boilerplate as-is
Cost: $0.0001
Time: ~500ms
```

### Scenario 2: Complex Feature Request

```
User: "Create a counter miniapp with voting"
Stage 1: Intent Parser (Haiku) → needsChanges: true
Stage 2: Patch Planner (Sonnet) → plan changes
Stage 3: Code Generator (Opus) → generate code
Stage 4: Validator (Sonnet) → fix errors (if needed)
Cost: $0.0081
Time: ~10-15 seconds
```

### Scenario 3: Legacy Single-Stage

```
User: "Create a todo app"
Single Stage: Code Generator (Opus) → generate everything
Cost: $0.0050
Time: ~8-12 seconds
```

## Configuration

The model selection is configured in `lib/llmOptimizer.ts`:

```typescript
export const STAGE_MODEL_CONFIG = {
  STAGE_1_INTENT_PARSER: {
    model: ANTHROPIC_MODELS.FAST,
    maxTokens: 2000,
    temperature: 0,
    reason: "Simple JSON parsing task, fast model sufficient",
  },
  // ... other stages
};
```

## Monitoring and Logging

Each LLM call includes detailed logging:

- Model used
- Input/output token counts
- Response time
- Cost estimate
- Stage-specific information

Example log output:

```
🤖 LLM Call - Stage 1: Intent Parser
📤 Input:
  System Prompt Length: 2048 chars
  User Prompt: USER REQUEST: Create miniapp
  Model: claude-3-haiku-20240307
  Max Tokens: 2000
  Reason: Simple JSON parsing task, fast model sufficient
📥 Output:
  Response Length: 512 chars
  Response Time: 2341 ms
  Cost Estimate: ~$0.0001
```

## Recommendations

1. **Use Multi-Stage Pipeline**: Better reliability and debugging
2. **Monitor Costs**: Track usage patterns and optimize
3. **Early Termination**: Leverage smart detection for basic requests
4. **Stage-Specific Models**: Right tool for the right job
5. **Validation Only When Needed**: Skip Stage 4 for successful generations

## Future Optimizations

1. **Model Caching**: Cache common responses
2. **Parallel Processing**: Run independent stages in parallel
3. **Dynamic Model Selection**: Choose models based on request complexity
4. **Cost Budgeting**: Set per-request cost limits
5. **Performance Monitoring**: Track success rates by model
