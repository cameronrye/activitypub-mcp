/**
 * MCP Prompt handlers for ActivityPub interactions.
 *
 * This module defines all MCP prompts that provide guided interactions
 * for exploring and discovering Fediverse content.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Registers all MCP prompts on the server.
 *
 * @param mcpServer - The MCP server instance
 */
export function registerPrompts(mcpServer: McpServer): void {
  // Discovery prompts
  registerExploreFediversePrompt(mcpServer);
  registerDiscoverContentPrompt(mcpServer);

  // Analysis prompts
  registerCompareInstancesPrompt(mcpServer);
  registerCompareAccountsPrompt(mcpServer);
  registerAnalyzeUserActivityPrompt(mcpServer);

  // Research prompts
  registerFindExpertsPrompt(mcpServer);
  registerSummarizeTrendingPrompt(mcpServer);

  // v1.1.0 New prompts
  registerContentStrategyPrompt(mcpServer);
  registerCommunityHealthPrompt(mcpServer);
  registerMigrationHelperPrompt(mcpServer);
  registerThreadComposerPrompt(mcpServer);
}

/**
 * Fediverse exploration prompt.
 */
function registerExploreFediversePrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "explore-fediverse",
    {
      title: "Explore the Fediverse",
      description: "Get guidance on exploring and discovering content in the fediverse",
      argsSchema: {
        interests: z
          .string()
          .min(1, "Interests cannot be empty")
          .max(500, "Interests too long")
          .describe("Your interests or topics you want to explore"),
        instanceType: z
          .enum(["mastodon", "pleroma", "misskey", "pixelfed", "peertube", "any"])
          .optional()
          .describe("Preferred type of fediverse instance"),
      },
    },
    ({ interests, instanceType }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `I'm interested in exploring the fediverse, particularly content related to: ${interests}. ${instanceType && instanceType !== "any" ? `I prefer ${instanceType} instances.` : ""} Can you help me discover interesting actors, instances, and communities to follow? Please suggest specific usernames and instances I should check out.`,
          },
        },
      ],
    }),
  );
}

/**
 * Instance comparison prompt.
 */
function registerCompareInstancesPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "compare-instances",
    {
      title: "Compare Fediverse Instances",
      description: "Get help comparing different fediverse instances",
      argsSchema: {
        instances: z
          .string()
          .min(1, "Instances list cannot be empty")
          .max(500, "Instances list too long")
          .describe("Comma-separated list of instance domains to compare"),
        criteria: z
          .string()
          .min(1, "Criteria cannot be empty")
          .max(500, "Criteria too long")
          .optional()
          .describe("Specific criteria for comparison (e.g., size, rules, features)"),
      },
    },
    ({ instances, criteria }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please help me compare these fediverse instances: ${instances}. ${criteria ? `I'm particularly interested in: ${criteria}.` : ""} What are the key differences, strengths, and characteristics of each instance? Which one might be best for different types of users?`,
          },
        },
      ],
    }),
  );
}

/**
 * Content discovery prompt.
 */
function registerDiscoverContentPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "discover-content",
    {
      title: "Discover Fediverse Content",
      description: "Get recommendations for discovering interesting content and people",
      argsSchema: {
        topics: z
          .string()
          .min(1, "Topics cannot be empty")
          .max(500, "Topics too long")
          .describe("Comma-separated topics or subjects you want to explore"),
        contentType: z
          .enum(["people", "hashtags", "instances", "all"])
          .optional()
          .describe("Type of content to discover"),
      },
    },
    ({ topics, contentType = "all" }) => {
      let contentTypeText = "content";
      let suggestionType = "accounts, hashtags, and instances";

      if (contentType === "people") {
        contentTypeText = "people";
        suggestionType = "accounts to follow";
      } else if (contentType === "hashtags") {
        contentTypeText = "hashtags";
        suggestionType = "hashtags to search";
      } else if (contentType === "instances") {
        contentTypeText = "instances";
        suggestionType = "instances to explore";
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `I want to discover ${contentTypeText} related to "${topics}" in the fediverse. Can you suggest specific ${suggestionType} that would be interesting for someone interested in ${topics}?`,
            },
          },
        ],
      };
    },
  );
}

/**
 * Compare accounts prompt.
 */
function registerCompareAccountsPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "compare-accounts",
    {
      title: "Compare Fediverse Accounts",
      description: "Get help comparing different fediverse accounts side by side",
      argsSchema: {
        accounts: z
          .string()
          .min(1, "Accounts list cannot be empty")
          .max(500, "Accounts list too long")
          .describe(
            "Comma-separated list of account identifiers to compare (e.g., user1@mastodon.social, user2@fosstodon.org)",
          ),
        aspects: z
          .string()
          .min(1, "Aspects cannot be empty")
          .max(500, "Aspects too long")
          .optional()
          .describe("Specific aspects to compare (e.g., posting frequency, topics, engagement)"),
      },
    },
    ({ accounts, aspects }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please help me compare these fediverse accounts: ${accounts}. ${aspects ? `I'm particularly interested in comparing: ${aspects}.` : ""}

For each account, please analyze:
1. Their posting frequency and activity level
2. The topics and themes they discuss
3. Their engagement style (do they reply, boost, etc.)
4. Their follower/following ratio
5. Any notable characteristics

Please use the discover-actor and fetch-timeline tools to gather information about each account, then provide a comprehensive comparison.`,
          },
        },
      ],
    }),
  );
}

/**
 * Analyze user activity prompt.
 */
function registerAnalyzeUserActivityPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "analyze-user-activity",
    {
      title: "Analyze User Activity",
      description: "Get a detailed analysis of a fediverse user's activity and posting patterns",
      argsSchema: {
        identifier: z
          .string()
          .min(3, "Identifier too short")
          .max(320, "Identifier too long")
          .describe("Actor identifier (e.g., user@mastodon.social)"),
        depth: z
          .enum(["quick", "standard", "comprehensive"])
          .optional()
          .describe(
            "Analysis depth: quick (recent posts), standard (default), or comprehensive (full history)",
          ),
      },
    },
    ({ identifier, depth = "standard" }) => {
      let depthInstructions = "Analyze their recent 20 posts";
      if (depth === "quick") {
        depthInstructions = "Do a quick analysis of their 10 most recent posts";
      } else if (depth === "comprehensive") {
        depthInstructions = "Do a comprehensive analysis using up to 50 posts";
      }

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please analyze the activity of this fediverse user: ${identifier}

${depthInstructions} and provide insights on:

1. **Posting Patterns**: When are they most active? How often do they post?
2. **Content Themes**: What topics do they discuss most frequently?
3. **Engagement Style**: Do they primarily post original content, reply to others, or boost content?
4. **Hashtag Usage**: What hashtags do they commonly use?
5. **Content Warnings**: Do they use content warnings? For what topics?
6. **Media Usage**: Do they share images, videos, or links frequently?
7. **Network**: Who do they interact with most?

Please use discover-actor to get their profile information and fetch-timeline to analyze their posts.`,
            },
          },
        ],
      };
    },
  );
}

/**
 * Find experts prompt.
 */
function registerFindExpertsPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "find-experts",
    {
      title: "Find Experts on Topic",
      description:
        "Find fediverse accounts that are experts or active contributors in a specific topic",
      argsSchema: {
        topic: z
          .string()
          .min(1, "Topic cannot be empty")
          .max(200, "Topic too long")
          .describe(
            "The topic or field to find experts in (e.g., 'machine learning', 'rust programming', 'climate science')",
          ),
        instances: z
          .string()
          .max(500, "Instances list too long")
          .optional()
          .describe(
            "Comma-separated list of instances to search (default: searches popular instances)",
          ),
      },
    },
    ({ topic, instances }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me find experts and active contributors discussing "${topic}" in the fediverse.

${instances ? `Please search these instances: ${instances}` : "Please search popular instances like mastodon.social, fosstodon.org, and relevant topic-specific instances."}

For each potential expert, please:
1. Search for accounts using search-accounts with relevant keywords
2. Check their recent posts with fetch-timeline to verify they actively discuss the topic
3. Look at their bio and profile for credentials or expertise indicators

Provide a list of recommended accounts to follow, with a brief explanation of why each one is relevant to the topic. Prioritize:
- Accounts that post original content about the topic
- Accounts with thoughtful analysis or insights
- Active accounts (posting in the last month)
- Accounts that engage with the community (replies, discussions)`,
          },
        },
      ],
    }),
  );
}

/**
 * Summarize trending prompt.
 */
function registerSummarizeTrendingPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "summarize-trending",
    {
      title: "Summarize Trending Topics",
      description:
        "Get a summary of what's currently trending and being discussed in the fediverse",
      argsSchema: {
        instances: z
          .string()
          .max(500, "Instances list too long")
          .optional()
          .describe("Comma-separated list of instances to check (default: mastodon.social)"),
        focus: z
          .enum(["general", "tech", "news", "art", "science", "all"])
          .optional()
          .describe("Focus area for trending topics"),
      },
    },
    ({ instances = "mastodon.social", focus = "general" }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please provide a summary of what's currently trending in the fediverse.

Check these instances: ${instances}

Focus: ${focus === "all" ? "all topics" : focus}

Please:
1. Use get-trending-hashtags to see what hashtags are popular
2. Use get-trending-posts to see what content is getting engagement
3. Check the local or federated timeline for recent discussions

Provide a summary that includes:
- **Top Trending Hashtags**: What tags are people using?
- **Hot Topics**: What are people discussing right now?
- **Popular Posts**: Highlight any particularly engaging or viral content
- **Emerging Discussions**: Any new topics gaining traction?

${focus !== "all" && focus !== "general" ? `Please focus particularly on ${focus}-related content.` : ""}

Format the summary in an easy-to-read way that helps me quickly understand what's happening in the fediverse right now.`,
          },
        },
      ],
    }),
  );
}

// =============================================================================
// v1.1.0 New Prompts
// =============================================================================

/**
 * Content strategy prompt - helps plan posting schedule and content.
 */
function registerContentStrategyPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "content-strategy",
    {
      title: "Content Strategy Planner",
      description:
        "Get help planning your fediverse content strategy based on trending topics and audience analysis",
      argsSchema: {
        topics: z
          .string()
          .min(1, "Topics cannot be empty")
          .max(500, "Topics too long")
          .describe("Your main topics or niche (comma-separated)"),
        targetAudience: z
          .string()
          .max(300, "Target audience too long")
          .optional()
          .describe("Who you want to reach (e.g., 'developers', 'artists', 'activists')"),
        postingFrequency: z
          .enum(["daily", "several-per-week", "weekly", "occasional"])
          .optional()
          .describe("How often you plan to post"),
        instances: z
          .string()
          .max(500, "Instances too long")
          .optional()
          .describe("Instances to analyze for trends (default: mastodon.social)"),
      },
    },
    ({
      topics,
      targetAudience,
      postingFrequency = "several-per-week",
      instances = "mastodon.social",
    }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me develop a content strategy for the fediverse.

**My Topics/Niche:** ${topics}
**Target Audience:** ${targetAudience || "General fediverse users"}
**Posting Frequency:** ${postingFrequency}
**Instances to Analyze:** ${instances}

Please:
1. Use get-trending-hashtags on ${instances} to find relevant trending tags
2. Use search-hashtags to explore hashtags related to my topics
3. Use find-experts prompt thinking to identify successful accounts in my niche

Provide a content strategy that includes:

**Content Pillars:**
- What types of posts should I create?
- What hashtags should I use regularly?
- What topics resonate with my target audience?

**Posting Recommendations:**
- Best times/days to post (based on when content gets engagement)
- Optimal post length and format
- Content mix (original posts, replies, boosts)

**Hashtag Strategy:**
- Primary hashtags for discoverability
- Niche hashtags for targeted reach
- Trending hashtags to join conversations

**Engagement Tips:**
- How to grow my following authentically
- Communities/instances to engage with
- Accounts to interact with

**Content Calendar Ideas:**
- Weekly themes or series
- Timely content opportunities
- Recurring post formats`,
          },
        },
      ],
    }),
  );
}

/**
 * Community health prompt - analyze instance moderation and community.
 */
function registerCommunityHealthPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "community-health",
    {
      title: "Community Health Check",
      description: "Analyze the health and moderation quality of a fediverse instance or community",
      argsSchema: {
        instance: z
          .string()
          .min(1, "Instance cannot be empty")
          .max(200, "Instance too long")
          .describe("Instance domain to analyze (e.g., mastodon.social)"),
        concerns: z
          .string()
          .max(500, "Concerns too long")
          .optional()
          .describe("Specific concerns to investigate (e.g., 'spam', 'harassment', 'moderation')"),
      },
    },
    ({ instance, concerns }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Please analyze the community health of the fediverse instance: ${instance}

${concerns ? `**Specific concerns to investigate:** ${concerns}` : ""}

Please:
1. Use get-instance-info to get details about the instance
2. Use get-local-timeline to sample recent public posts
3. Use get-trending-posts to see what content is being promoted
4. Look for any visible moderation issues or community concerns

Provide an analysis that covers:

**Instance Overview:**
- Software and version
- User count and activity level
- Registration policy (open/closed/approval)
- Admin/moderator contact info

**Community Culture:**
- What topics do users discuss?
- Tone and atmosphere (friendly, professional, casual, etc.)
- Content warning usage and norms
- Language diversity

**Moderation Assessment:**
- Are there visible rules/guidelines?
- Evidence of active moderation
- Spam or harassment visibility
- Content warning enforcement

**Red Flags (if any):**
- Unmoderated harmful content
- Spam prevalence
- Harassment patterns
- Technical issues

**Green Flags:**
- Active, engaged community
- Responsive moderation
- Clear community guidelines
- Healthy discussions

**Recommendations:**
- Is this instance suitable for [general users / specific communities]?
- Any precautions to take?
- Alternative instances to consider?`,
          },
        },
      ],
    }),
  );
}

/**
 * Migration helper prompt - help users evaluate moving instances.
 */
function registerMigrationHelperPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "migration-helper",
    {
      title: "Instance Migration Helper",
      description: "Get help evaluating and planning a migration to a new fediverse instance",
      argsSchema: {
        currentInstance: z
          .string()
          .max(200, "Current instance too long")
          .optional()
          .describe("Your current instance (if any)"),
        targetInstance: z
          .string()
          .max(200, "Target instance too long")
          .optional()
          .describe("Instance you're considering moving to"),
        priorities: z
          .string()
          .min(1, "Priorities cannot be empty")
          .max(500, "Priorities too long")
          .describe(
            "What matters most to you (e.g., 'moderation, privacy, community size, specific topic focus')",
          ),
        currentFollowers: z
          .number()
          .optional()
          .describe("Approximate number of followers you have"),
      },
    },
    ({ currentInstance, targetInstance, priorities, currentFollowers }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me evaluate a potential fediverse instance migration.

${currentInstance ? `**Current Instance:** ${currentInstance}` : "**New to Fediverse:** Looking for first instance"}
${targetInstance ? `**Considering:** ${targetInstance}` : "**Open to suggestions**"}
**My Priorities:** ${priorities}
${currentFollowers ? `**Current Followers:** ~${currentFollowers}` : ""}

Please:
1. ${currentInstance ? `Use get-instance-info on ${currentInstance} to understand my current situation` : "Skip current instance analysis"}
2. ${targetInstance ? `Use get-instance-info on ${targetInstance} to evaluate the target` : "Use discover-instances to find suitable options"}
3. Use compare-instances thinking to evaluate options
4. Consider my stated priorities

Provide guidance on:

**Instance Comparison:**
${
  currentInstance && targetInstance
    ? `
| Aspect | ${currentInstance} | ${targetInstance} |
|--------|---------------------|-------------------|
| Users | ? | ? |
| Software | ? | ? |
| Registrations | ? | ? |
| Focus/Culture | ? | ? |
`
    : "Evaluate potential instances against my priorities"
}

**Migration Considerations:**
- What will I keep? (posts can be exported, followers can migrate)
- What might I lose? (old URLs, some followers who don't follow redirects)
- How long does migration typically take?

**Pre-Migration Checklist:**
- [ ] Export your data from current instance
- [ ] Set up account on new instance
- [ ] Configure redirect on old account
- [ ] Notify followers of the move
- [ ] Update any external links

**Recommended Instances:**
Based on your priorities (${priorities}), these instances might be good fits:
[List 3-5 instances with brief explanations]

**Final Recommendation:**
Should you migrate? Why or why not?`,
          },
        },
      ],
    }),
  );
}

/**
 * Thread composer prompt - help write long-form threaded content.
 */
function registerThreadComposerPrompt(mcpServer: McpServer): void {
  mcpServer.registerPrompt(
    "thread-composer",
    {
      title: "Thread Composer",
      description: "Get help composing a well-structured thread for the fediverse",
      argsSchema: {
        topic: z
          .string()
          .min(1, "Topic cannot be empty")
          .max(300, "Topic too long")
          .describe("What your thread is about"),
        keyPoints: z
          .string()
          .min(1, "Key points cannot be empty")
          .max(2000, "Key points too long")
          .describe("Main points you want to cover (one per line or comma-separated)"),
        tone: z
          .enum(["informative", "casual", "professional", "persuasive", "storytelling"])
          .optional()
          .describe("The tone of your thread"),
        targetLength: z
          .enum(["short", "medium", "long"])
          .optional()
          .describe("Thread length: short (3-5 posts), medium (6-10), long (11+)"),
        includeHashtags: z.boolean().optional().describe("Whether to suggest relevant hashtags"),
        contentWarning: z
          .string()
          .max(200, "CW too long")
          .optional()
          .describe("Content warning if needed"),
      },
    },
    ({
      topic,
      keyPoints,
      tone = "informative",
      targetLength = "medium",
      includeHashtags = true,
      contentWarning,
    }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Help me compose a fediverse thread about: ${topic}

**Key Points to Cover:**
${keyPoints}

**Tone:** ${tone}
**Target Length:** ${targetLength} (${targetLength === "short" ? "3-5" : targetLength === "medium" ? "6-10" : "11+"} posts)
${contentWarning ? `**Content Warning:** ${contentWarning}` : ""}
**Include Hashtags:** ${includeHashtags ? "Yes" : "No"}

Please help me create a well-structured thread:

**Thread Structure:**
1. Hook post (attention-grabbing opener)
2. Context/background
3. Main points (one per post ideally)
4. Supporting details/examples
5. Conclusion/call-to-action

**Guidelines:**
- Each post should be under 500 characters
- Posts should stand alone but flow together
- Use clear transitions between posts
- Number posts (1/n, 2/n, etc.) for clarity
- End with engagement prompt or CTA

${
  includeHashtags
    ? `**Hashtag Research:**
Please use search-hashtags to find relevant tags for "${topic}" and suggest:
- 2-3 primary hashtags for the first post
- Topic-specific hashtags where relevant
- Don't overuse hashtags (2-4 per post max)`
    : ""
}

**Output Format:**
Please provide each post in the thread like this:

---
**Post 1/${targetLength === "short" ? "5" : targetLength === "medium" ? "8" : "12"}** ${contentWarning ? `[CW: ${contentWarning}]` : ""}
[Post content here]
${includeHashtags ? "[Hashtags]" : ""}

---
**Post 2/n**
[Content continues...]

And so on for each post in the thread.`,
          },
        },
      ],
    }),
  );
}
