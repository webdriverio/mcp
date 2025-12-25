# Strategic Assessment: AI-Powered Full-Stack Test Automation

> **Date**: December 2024
> **Status**: Active Development
> **Goal**: Train lightweight models to navigate web and mobile apps for functional testing

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Use Case Viability](#use-case-viability)
3. [How Data Scientists Train Models for This](#how-data-scientists-train-models-for-this)
4. [Existing Solutions Comparison](#existing-solutions-comparison)
5. [Strategic Differentiator: Full-Stack Automation](#strategic-differentiator-full-stack-automation)
6. [Architecture](#architecture)
7. [LangChain-Ollama Integration](#langchain-ollama-integration)
8. [Training Data Strategy](#training-data-strategy)
9. [Phased Roadmap](#phased-roadmap)
10. [Risks and Mitigations](#risks-and-mitigations)
11. [Conclusion](#conclusion)

---

## Executive Summary

### The Vision

Build an AI-powered test automation agent (`wdio-agent`) that can:
- **Navigate web browsers** (Chrome, Firefox, Safari)
- **Automate iOS apps** (via Appium + XCUITest)
- **Automate Android apps** (via Appium + UiAutomator2)

All using the same agent architecture, same training approach, and same natural language interface.

### Why This Matters

**No existing open-source agent framework supports mobile app automation.** Browser-Use, LaVague, Skyvern, and Agent-E are all web-only. By building on WebDriverIO + Appium, we create the first unified AI agent for full-stack test automation.

### Current State

```
✅ Web automation agent (working)
✅ Training data collection pipeline (working)
✅ MCP server with mobile tools (working)
⏳ Mobile agent integration (planned)
⏳ LangChain-Ollama integration (planned)
⏳ Fine-tuned model (pending data collection)
```

---

## Use Case Viability

### Assessment: HIGHLY VIABLE

Web and mobile automation are ideal fits for lightweight language models because:

| Factor | Why It Works |
|--------|--------------|
| **Discrete action space** | Limited tools: click, tap, type, swipe, navigate |
| **Structured reasoning** | ReAct pattern (OBSERVE→BLOCKER→THINK→ACTION) helps small models |
| **Clear success criteria** | Task completes or fails - binary outcome |
| **Pattern recognition** | Cookie modals, login forms, permission dialogs are repeated patterns |
| **Bounded context** | Page/screen state is finite and describable |

### Challenges

| Challenge | Mitigation |
|-----------|------------|
| **Generalization to unseen sites/apps** | Fine-tune on diverse examples, use synthetic data |
| **Dynamic content (SPAs, AJAX)** | Wait strategies, re-fetch elements after actions |
| **Selector brittleness** | Prefer accessibility IDs, generate multiple locator strategies |
| **Multi-step reasoning** | Limit to 15 iterations, use chain-of-thought prompting |
| **Platform differences** | Platform-specific prompts and tool sets |

### Evidence from Research

- **WebArena** (2023): Demonstrated GPT-4 can achieve 14.4% success on complex web tasks
- **Mind2Web** (2023): Showed fine-tuned models outperform zero-shot on web navigation
- **AppAgent** (2024): Proved LLMs can control mobile apps via accessibility APIs
- **Browser-Use**: 5k+ GitHub stars, production usage validates the approach

---

## How Data Scientists Train Models for This

### Training Approaches (Simplest to Most Sophisticated)

```
┌─────────────────┬────────────────┬───────────────┬──────────────────┐
│ Behavioral      │ SFT +          │ DPO / RLHF    │ Online RL        │
│ Cloning         │ Synthetic Data │               │ (PPO, GRPO)      │
│                 │                │               │                  │
│ Current         │ Recommended    │ Advanced      │ Research-grade   │
│ Approach        │ Next Step      │               │                  │
└─────────────────┴────────────────┴───────────────┴──────────────────┘
```

### Current Approach: Behavioral Cloning (SFT)

```
1. Run successful test scenarios manually guided
2. Collect (state, action, result) tuples
3. Format as ChatML conversations
4. Fine-tune with LoRA/QLoRA
5. Export to GGUF for Ollama
```

**Pros**: Simple, works with limited data (50-100 examples)
**Cons**: Only learns from successes, doesn't learn from failures

### Recommended Enhancement: Synthetic Data Generation

```python
# Use a larger model to generate training examples
async def generate_synthetic_examples(task: str, num_examples: int = 10):
    """Generate training examples using Claude/GPT-4"""

    prompt = f"""Generate {num_examples} different successful execution traces
    for this web automation task: "{task}"

    Each trace should show the full ReAct reasoning:
    OBSERVE: [what the agent sees]
    BLOCKER: [any obstacles]
    THINK: [reasoning about next action]
    ACTION: [tool call with parameters]

    Vary the scenarios (different sites, different selectors, edge cases).
    Format as JSON array of conversation messages."""

    response = await claude.messages.create(
        model="claude-sonnet-4-20250514",
        messages=[{"role": "user", "content": prompt}]
    )

    return parse_as_training_examples(response)
```

### Advanced: Direct Preference Optimization (DPO)

Train on (preferred, rejected) action pairs:

```json
{
  "prompt": "Page shows login form with email field blocked by cookie modal",
  "chosen": "THINK: Must dismiss cookie modal first. ACTION: click_element('#reject-cookies')",
  "rejected": "THINK: Enter email directly. ACTION: set_value('#email', 'test@example.com')"
}
```

DPO teaches the model *why* certain actions are better, not just *what* to do.

---

## Existing Solutions Comparison

### Web Automation Agents

| Solution | Stars | LLM Support | Automation | Mobile | Status |
|----------|-------|-------------|------------|--------|--------|
| [Browser-Use](https://github.com/browser-use/browser-use) | 5k+ | LangChain (any) | Playwright | ❌ | Active |
| [LaVague](https://github.com/lavague-ai/LaVague) | 4k+ | Local + API | Selenium | ❌ | Active |
| [Skyvern](https://github.com/Skyvern-AI/skyvern) | 3k+ | GPT-4V | Playwright | ❌ | Active |
| [Agent-E](https://github.com/EmergenceAI/Agent-E) | 1k+ | Multi-model | Playwright | ❌ | Active |
| **wdio-agent** | - | Ollama | WebDriverIO | ✅ | Building |

### Key Insight

**All existing solutions are web-only.** None support:
- iOS app automation
- Android app automation
- Hybrid app context switching
- Mobile gestures (swipe, long press)

This is our strategic differentiator.

### Why Not Just Use Browser-Use?

Browser-Use is excellent for web automation:

```python
from browser_use import Agent
from langchain_ollama import ChatOllama

agent = Agent(
    task="Search for flights to Tokyo",
    llm=ChatOllama(model="qwen3:8b")
)
await agent.run()
```

But it cannot:
- Launch iOS/Android apps
- Interact with native mobile elements
- Handle mobile-specific patterns (permissions, gestures)
- Use the same automation framework as existing WDIO test suites

---

## Strategic Differentiator: Full-Stack Automation

### The Vision

```
┌─────────────────────────────────────────────────────────────────────┐
│                          wdio-agent                                 │
│              Unified AI Agent for Full-Stack Automation             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│      ┌──────────┐       ┌──────────┐       ┌──────────┐            │
│      │   Web    │       │   iOS    │       │ Android  │            │
│      │ Browsers │       │   Apps   │       │   Apps   │            │
│      └────┬─────┘       └────┬─────┘       └────┬─────┘            │
│           │                  │                  │                   │
│           └──────────────────┼──────────────────┘                   │
│                              │                                      │
│                    ┌─────────▼─────────┐                            │
│                    │    WebDriverIO    │                            │
│                    │    Unified API    │                            │
│                    └─────────┬─────────┘                            │
│                              │                                      │
│           ┌──────────────────┼──────────────────┐                   │
│           │                  │                  │                   │
│     ChromeDriver      Appium/XCUITest    Appium/UIA2               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Unified Natural Language Interface

```bash
# Web automation
wdio-agent "go to amazon.com and search for wireless headphones"

# iOS automation
wdio-agent --platform ios --app ./MyApp.app \
  "log in with test@example.com and navigate to settings"

# Android automation
wdio-agent --platform android --app ./app.apk \
  "complete the onboarding flow and enable notifications"
```

### Same Training, Different Contexts

The model learns platform-agnostic reasoning:
- **OBSERVE**: What elements are visible?
- **BLOCKER**: Is something blocking the goal? (cookie modal, permission dialog)
- **THINK**: What's the next logical action?
- **ACTION**: Execute the appropriate tool

Platform-specific knowledge is encoded in:
1. Different tool sets (tap vs click, swipe for mobile)
2. Different system prompts (selector strategies, common patterns)
3. Platform-specific training examples

---

## Architecture

### Current Structure

```
src/
├── agent/                      # Agent loop (Ollama-based)
│   ├── agent-loop.ts           # Main orchestration
│   ├── tool-registry.ts        # Tool definitions for LLM
│   ├── tool-executor.ts        # Execute tools via WebDriverIO
│   ├── ollama-client.ts        # Ollama HTTP client
│   ├── prompts.ts              # System prompts
│   ├── loop-detection.ts       # Prevent infinite loops
│   ├── element-formatter.ts    # Format elements for LLM
│   ├── data-collector.ts       # Training data capture
│   └── types.ts                # TypeScript types
│
├── tools/                      # MCP server tools (shared)
│   ├── browser.tool.ts         # Web session management
│   ├── app-session.tool.ts     # Mobile session management
│   ├── navigation.tool.ts      # URL navigation
│   ├── element.tool.ts         # Element interactions
│   └── gesture.tool.ts         # Mobile gestures
│
├── locators/                   # Element detection
│   ├── element-filter.ts       # Filter interactable elements
│   ├── generate-all-locators.ts # Multi-strategy locators
│   └── source-parsing.ts       # Parse page source XML
│
├── cli/                        # CLI entry point
│   ├── index.ts
│   └── config.ts
│
└── server.ts                   # MCP server for Claude Desktop
```

### Proposed: Shared Tool Layer

The agent and MCP server should share tool implementations:

```typescript
// src/tools/unified-session.tool.ts
export async function startSession(options: SessionOptions): Promise<SessionResult> {
  if (options.platform === 'web') {
    return startBrowserSession(options);
  } else if (options.platform === 'ios') {
    return startIOSSession(options);
  } else if (options.platform === 'android') {
    return startAndroidSession(options);
  }
}

// src/agent/tool-executor.ts
import { startSession } from '../tools/unified-session.tool.js';

async function executeTool(name: string, args: unknown): Promise<string> {
  switch (name) {
    case 'start_session':
      return formatResult(await startSession(args));
    // ... other tools
  }
}
```

---

## LangChain-Ollama Integration

### Why LangChain?

LangChain provides:
1. **Unified LLM interface** - Switch between Ollama, OpenAI, Anthropic seamlessly
2. **Tool calling abstraction** - Standardized tool definition and execution
3. **Agent frameworks** - ReAct, Plan-and-Execute, etc. built-in
4. **Observability** - LangSmith for tracing and debugging

### Installation

```bash
npm install @langchain/core @langchain/ollama @langchain/langgraph
```

### Proposed Integration

```typescript
// src/agent/langchain-agent.ts
import { ChatOllama } from "@langchain/ollama";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

// Define tools using LangChain format
const startSessionTool = tool(
  async ({ platform, app, headless }) => {
    // Reuse existing WebDriverIO implementation
    const result = await startSession({ platform, app, headless });
    return result.message;
  },
  {
    name: "start_session",
    description: "Start a browser or mobile app session. Must call first.",
    schema: z.object({
      platform: z.enum(["web", "ios", "android"]).describe("Target platform"),
      app: z.string().optional().describe("Path to mobile app (iOS .app/.ipa, Android .apk)"),
      headless: z.boolean().optional().describe("Run browser without UI (web only)"),
    }),
  }
);

const navigateTool = tool(
  async ({ url }) => {
    const browser = getBrowser();
    await browser.url(url);
    return `Navigated to ${url}`;
  },
  {
    name: "navigate",
    description: "Navigate to a URL (web only)",
    schema: z.object({
      url: z.string().describe("The URL to navigate to"),
    }),
  }
);

const tapElementTool = tool(
  async ({ selector }) => {
    const browser = getBrowser();
    const element = await browser.$(selector);
    await element.click();
    return `Tapped element: ${selector}`;
  },
  {
    name: "tap_element",
    description: "Tap/click an element by selector",
    schema: z.object({
      selector: z.string().describe("CSS selector, XPath, or accessibility ID"),
    }),
  }
);

// ... more tools

// Create the agent
export async function createWdioAgent(config: AgentConfig) {
  const llm = new ChatOllama({
    model: config.model || "qwen3:8b",
    baseUrl: config.ollamaUrl || "http://localhost:11434",
    temperature: 0.1,
  });

  const tools = [
    startSessionTool,
    navigateTool,
    getVisibleElementsTool,
    tapElementTool,
    setValueTool,
    swipeTool,
    taskCompleteTool,
  ];

  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: getSystemPrompt(config.platform),
  });

  return agent;
}

// Run the agent
export async function runLangChainAgent(goal: string, config: AgentConfig) {
  const agent = await createWdioAgent(config);

  const result = await agent.invoke({
    messages: [{ role: "user", content: `Complete this task: ${goal}` }],
  });

  return {
    success: result.messages.some(m => m.content?.includes("task_complete")),
    messages: result.messages,
  };
}
```

### Multi-Model Support

With LangChain, easily switch between models:

```typescript
import { ChatOllama } from "@langchain/ollama";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";

function createLLM(provider: string, model: string) {
  switch (provider) {
    case "ollama":
      return new ChatOllama({ model, temperature: 0.1 });
    case "anthropic":
      return new ChatAnthropic({ model, temperature: 0.1 });
    case "openai":
      return new ChatOpenAI({ model, temperature: 0.1 });
  }
}

// Use local model for simple tasks, Claude for complex ones
const simpleLLM = createLLM("ollama", "qwen3:8b");
const complexLLM = createLLM("anthropic", "claude-sonnet-4-20250514");
```

### Benefits Over Current Ollama Client

| Feature | Current (ollama-client.ts) | LangChain-Ollama |
|---------|---------------------------|------------------|
| Multi-provider | ❌ Ollama only | ✅ Any provider |
| Tool calling | Custom parsing | ✅ Standardized |
| Streaming | ❌ Not implemented | ✅ Built-in |
| Memory | Manual | ✅ Built-in options |
| Tracing | ❌ None | ✅ LangSmith |
| Agent types | Custom ReAct | ✅ ReAct, Plan-Execute, etc. |

### Migration Path

```
Phase 1: Add LangChain alongside existing client
         - New file: src/agent/langchain-agent.ts
         - Keep ollama-client.ts for backward compatibility
         - Feature flag: --use-langchain

Phase 2: Validate parity
         - Run same test suite with both implementations
         - Compare success rates, latency, token usage

Phase 3: Migrate if beneficial
         - Make LangChain the default
         - Deprecate custom Ollama client
```

---

## Training Data Strategy

### Data Requirements by Platform

| Platform | Examples Needed | Key Patterns |
|----------|-----------------|--------------|
| Web | 100+ | Cookie modals, forms, search, navigation, pagination |
| iOS | 100+ | Permission dialogs, gestures, tab bars, alerts |
| Android | 100+ | Back button, notifications, material design patterns |
| Cross-platform | 50+ | Same task on web + mobile (e.g., login flow) |

### Training Data Format

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a test automation agent for [web|iOS|Android]. Before each action, reason step-by-step using OBSERVE/BLOCKER/THINK/ACTION format.\n\nTOOLS:\n- start_session: Launch browser or app\n- tap_element: Tap by selector\n..."
    },
    {
      "role": "user",
      "content": "Complete this task: Log into the app with username 'test@example.com'"
    },
    {
      "role": "assistant",
      "content": "OBSERVE: App launched, showing login screen with email and password fields.\nBLOCKER: None.\nTHINK: I should tap the email field and enter the username.\nACTION: Tapping email field",
      "tool_calls": [{
        "type": "function",
        "function": {
          "name": "tap_element",
          "arguments": "{\"selector\": \"~emailTextField\"}"
        }
      }]
    },
    {
      "role": "tool",
      "name": "tap_element",
      "content": "Tapped element: ~emailTextField"
    }
  ],
  "metadata": {
    "platform": "ios",
    "app": "MyApp.app",
    "goal": "Log into the app with username 'test@example.com'",
    "success": true,
    "duration": 12500
  }
}
```

### Key Patterns to Train

#### Web Patterns

| Pattern | Example |
|---------|---------|
| Cookie consent | Dismiss before main action |
| Login form | Fill email, password, submit |
| Search | Type query, press Enter or click button |
| Pagination | Click "Next" or scroll to load more |
| Modal dismissal | Click X or outside to close |

#### iOS Patterns

| Pattern | Example |
|---------|---------|
| Permission dialog | Tap "Allow" for camera/location/notifications |
| Tab navigation | Tap tab bar items |
| Pull to refresh | Swipe down gesture |
| Swipe to delete | Swipe left on list item |
| Alert handling | Tap "OK" or "Cancel" |

#### Android Patterns

| Pattern | Example |
|---------|---------|
| Back navigation | Press back button (key code 4) |
| Permission dialog | Tap "Allow" or "While using app" |
| Drawer navigation | Swipe from left edge |
| Notification panel | Swipe down from top |
| Material FAB | Tap floating action button |

### Synthetic Data Generation Script

```python
# scripts/generate_synthetic_data.py
import anthropic
import json
from pathlib import Path

client = anthropic.Anthropic()

SCENARIOS = [
    # Web scenarios
    {"platform": "web", "task": "Search for 'wireless headphones' on Amazon"},
    {"platform": "web", "task": "Log into GitHub and create a new repository"},
    {"platform": "web", "task": "Find flights from NYC to Tokyo on Google Flights"},

    # iOS scenarios
    {"platform": "ios", "task": "Log into the app and navigate to settings"},
    {"platform": "ios", "task": "Add an item to cart and proceed to checkout"},
    {"platform": "ios", "task": "Grant camera permission and take a photo"},

    # Android scenarios
    {"platform": "android", "task": "Complete the onboarding tutorial"},
    {"platform": "android", "task": "Enable notifications in app settings"},
    {"platform": "android", "task": "Search for a product and add to favorites"},
]

def generate_example(scenario: dict) -> dict:
    prompt = f"""Generate a realistic test automation execution trace for:
    Platform: {scenario['platform']}
    Task: {scenario['task']}

    Use this exact format for each step:
    OBSERVE: [what the agent sees on screen]
    BLOCKER: [any obstacles, or "None"]
    THINK: [reasoning about next action]
    ACTION: [tool call]

    Include realistic element selectors for {scenario['platform']}:
    - Web: CSS selectors (#id, .class, [attr])
    - iOS: Accessibility IDs (~id), iOS predicates
    - Android: Accessibility IDs (~id), UiAutomator selectors

    Generate 4-8 steps to complete the task.
    Return as JSON array of message objects with role and content."""

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=4000,
        messages=[{"role": "user", "content": prompt}]
    )

    return {
        "messages": json.loads(response.content[0].text),
        "metadata": {
            "platform": scenario["platform"],
            "goal": scenario["task"],
            "success": True,
            "synthetic": True
        }
    }

def main():
    output_dir = Path.home() / ".wdio-agent" / "synthetic-data"
    output_dir.mkdir(parents=True, exist_ok=True)

    for i, scenario in enumerate(SCENARIOS):
        print(f"Generating example {i+1}/{len(SCENARIOS)}: {scenario['task']}")
        example = generate_example(scenario)

        output_file = output_dir / f"synthetic_{scenario['platform']}_{i}.json"
        with open(output_file, "w") as f:
            json.dump(example, f, indent=2)

    print(f"Generated {len(SCENARIOS)} synthetic examples in {output_dir}")

if __name__ == "__main__":
    main()
```

---

## Phased Roadmap

### Phase 1: Mobile Agent Foundation (2-3 weeks)

```
□ Unify session management
  ├── Add start_session tool with platform parameter
  ├── Reuse app-session.tool.ts from MCP server
  └── Update CLI to accept --platform, --app flags

□ Mobile-aware prompts
  ├── Create iOS-specific system prompt
  ├── Create Android-specific system prompt
  └── Include platform-specific selector examples

□ Mobile tool set
  ├── tap_element (works on both, alias for click)
  ├── swipe (direction, duration)
  ├── long_press (for context menus)
  └── get_visible_elements (already supports mobile)

□ Validation
  └── Test: "Open Settings app and toggle WiFi" on iOS simulator
```

### Phase 2: LangChain Integration (1-2 weeks)

```
□ Add LangChain dependencies
  └── @langchain/core, @langchain/ollama, @langchain/langgraph

□ Create LangChain agent
  ├── Define tools using LangChain tool() format
  ├── Create ReAct agent with createReactAgent
  └── Add --use-langchain flag for testing

□ Multi-provider support
  ├── Add --provider flag (ollama, openai, anthropic)
  └── Environment variable configuration

□ Validation
  └── Run same test suite with both implementations
```

### Phase 3: Training Data Pipeline (2-3 weeks)

```
□ Extend data collector for mobile
  ├── Capture platform metadata
  ├── Store app path / bundle ID
  └── Include device/simulator info

□ Synthetic data generation
  ├── Create generation script (Python + Claude API)
  ├── Generate 50 web examples
  ├── Generate 50 iOS examples
  └── Generate 50 Android examples

□ Training data validation
  ├── Format checker script
  ├── Deduplication
  └── Quality scoring

□ Fine-tuning pipeline
  └── Document fine-tuning process with combined dataset
```

### Phase 4: Vision Support (3-4 weeks)

```
□ Screenshot analysis
  ├── Integrate Qwen-VL or LLaVA via Ollama
  ├── Add take_screenshot tool that returns analysis
  └── "What element should I tap to proceed?"

□ Visual grounding
  ├── Element identification from screenshots
  ├── Fallback when selectors fail
  └── Useful for dynamic/complex UIs

□ Validation
  └── Compare success rates: text-only vs. vision-assisted
```

### Phase 5: Production Hardening (2-3 weeks)

```
□ Error recovery
  ├── Retry failed actions with alternative selectors
  ├── Screenshot on failure for debugging
  └── Graceful degradation to larger model

□ Performance optimization
  ├── Element caching
  ├── Parallel element detection
  └── Connection pooling for Appium

□ Observability
  ├── LangSmith integration for tracing
  ├── Success rate metrics
  └── Latency tracking

□ Documentation
  ├── Usage guide
  ├── Platform-specific tips
  └── Troubleshooting guide
```

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Small models fail on complex tasks | High | Medium | Multi-model routing (simple→small, complex→large) |
| Training data insufficient | Medium | High | Synthetic data generation, community contributions |
| Appium reliability issues | Medium | Medium | Retry logic, multiple locator strategies |
| LangChain overhead | Low | Low | Benchmark before committing, keep fallback |
| Model hallucination (wrong selectors) | High | Medium | Validation layer, vision fallback |

---

## Conclusion

### This Project Is Worth Building

1. **Unique value proposition**: First open-source AI agent for full-stack (web + mobile) test automation
2. **Strong foundation**: WebDriverIO + Appium provide battle-tested automation
3. **Clear path forward**: Phased roadmap with measurable milestones
4. **Growing market**: AI-assisted testing is a hot area with enterprise demand

### Key Success Factors

1. **Data quality over quantity**: 100 excellent examples beat 1000 poor ones
2. **Platform-specific optimization**: Don't try to make one prompt fit all
3. **Graceful degradation**: Fall back to larger models when small ones fail
4. **Community building**: Open-source the training data, invite contributions

### Next Actions

1. [ ] Implement Phase 1: Mobile agent foundation
2. [ ] Set up LangChain integration for multi-provider support
3. [ ] Generate 150+ synthetic training examples
4. [ ] Fine-tune Qwen3:8b on combined web + mobile dataset
5. [ ] Benchmark against Browser-Use on web-only tasks

---

## References

- [Browser-Use](https://github.com/browser-use/browser-use) - Web automation agent
- [WebArena](https://webarena.dev/) - Web navigation benchmark
- [Mind2Web](https://osu-nlp-group.github.io/Mind2Web/) - Web navigation dataset
- [AppAgent](https://github.com/mnotgod96/AppAgent) - Mobile app agent research
- [LangChain](https://js.langchain.com/) - LLM application framework
- [Unsloth](https://github.com/unslothai/unsloth) - Fast fine-tuning library
- [WebDriverIO](https://webdriver.io/) - Browser/mobile automation framework
- [Appium](https://appium.io/) - Mobile app automation
