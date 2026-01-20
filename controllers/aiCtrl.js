const { GoogleGenerativeAI } = require("@google/generative-ai");
const Users = require("../models/userModel");
const Posts = require("../models/postModel");
const Listings = require("../models/listingModel");

const aiCtrl = {
  // Helper functions for AI to call
  searchUsers: async (query) => {
    try {
      console.log(`🔍 [AI-DEBUG] Searching users for: "${query}"`);
      const users = await Users.find({
        $or: [
          { username: { $regex: query, $options: "i" } },
          { fullname: { $regex: query, $options: "i" } },
        ],
      })
        .select("username fullname avatar")
        .limit(5)
        .lean(); // Use lean() for plain objects

      console.log(`✅ [AI-DEBUG] Found ${users.length} users.`);
      return users.length > 0 ? users : "No users found matching that query.";
    } catch (err) {
      console.error(`❌ [AI-DEBUG] Error searching users:`, err.message);
      return "Error searching users.";
    }
  },

  searchPosts: async (query) => {
    try {
      console.log(`🔍 [AI-DEBUG] Searching posts for: "${query}"`);
      const posts = await Posts.find({
        content: { $regex: query, $options: "i" },
      })
        .populate("user", "username fullname")
        .sort("-createdAt")
        .limit(5)
        .lean();

      console.log(`✅ [AI-DEBUG] Found ${posts.length} posts.`);
      return posts.length > 0
        ? posts.map((p) => ({
            content: p.content,
            author: p.user?.username,
            date: p.createdAt,
          }))
        : "No posts found matching that query.";
    } catch (err) {
      console.error(`❌ [AI-DEBUG] Error searching posts:`, err.message);
      return "Error searching posts.";
    }
  },

  searchMarketplace: async (query) => {
    try {
      console.log(`🔍 [AI-DEBUG] Searching marketplace for: "${query}"`);
      const listings = await Listings.find({
        $or: [
          { name: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
        ],
      })
        .limit(5)
        .lean();

      console.log(`✅ [AI-DEBUG] Found ${listings.length} listings.`);
      return listings.length > 0
        ? listings.map((l) => ({
            name: l.name,
            price: l.price,
            description: l.description,
            address: l.address,
          }))
        : "No marketplace listings found matching that query.";
    } catch (err) {
      console.error(`❌ [AI-DEBUG] Error searching marketplace:`, err.message);
      return "Error searching marketplace.";
    }
  },

  navigateApp: async (screenName) => {
    console.log(`🤖 [AI-DEBUG] Navigation triggered for: "${screenName}"`);
    // Return a special command string that the frontend will interpret
    return `COMMAND:NAVIGATE:${screenName}`;
  },

  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("❌ [AI-DEBUG] GEMINI_API_KEY is missing!");
        return "I'm sorry, my Gemini API key is not configured.";
      }

      console.log(`🤖 [AI-DEBUG] Generating response for: "${currentMessage}"`);
      const genAI = new GoogleGenerativeAI(apiKey);
      const modelId = "gemini-1.5-flash";

      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: `You are the Official AI Assistant for Pipel, a social media app. 
        You have access to tools to search for users, posts, and marketplace listings, and to navigate the user to different parts of the app.
        
        Available Screens for Navigation:
        - Marketplace: Buy and sell items
        - Map: View location sharing and shared posts on a map
        - Discover: Explore new content
        - Notifications: See app notifications
        - Profile: User's personal profile
        - CreatePost: Create a new post
        - CreateListing: Post an item for sale in Marketplace
        
        When a user asks to "go to", "open", or "show" one of these screens, use the 'navigateApp' tool.
        If a user asks to find something, use the appropriate search tool first.
        If you find information, summarize it concisely and helpfully.
        
        IMPORTANT: If you use the 'navigateApp' tool, ALWAYS include the exact string "COMMAND:NAVIGATE:[ScreenName]" in your final response to the user so the app can detect it, while also explaining to the user in natural language that you are helping them navigate.`,
      });

      // Simple tool definitions for Gemini 1.5
      const tools = [
        {
          functionDeclarations: [
            {
              name: "searchUsers",
              description: "Search for users by username or fullname",
              parameters: {
                type: "OBJECT",
                properties: {
                  query: { type: "STRING", description: "The search term" },
                },
                required: ["query"],
              },
            },
            {
              name: "searchPosts",
              description: "Search for public posts by content",
              parameters: {
                type: "OBJECT",
                properties: {
                  query: { type: "STRING", description: "The search term" },
                },
                required: ["query"],
              },
            },
            {
              name: "searchMarketplace",
              description: "Search for items for sale in the marketplace",
              parameters: {
                type: "OBJECT",
                properties: {
                  query: { type: "STRING", description: "The search term" },
                },
                required: ["query"],
              },
            },
            {
              name: "navigateApp",
              description: "Navigate the user to a specific screen in the app",
              parameters: {
                type: "OBJECT",
                properties: {
                  screenName: {
                    type: "STRING",
                    description:
                      "The target screen name (e.g., Marketplace, Map, Discover, Profile, CreatePost, CreateListing)",
                  },
                },
                required: ["screenName"],
              },
            },
          ],
        },
      ];

      // Fix history mapping: ensure text is always a string and role is correct
      const chatHistory = history
        .map((h) => {
          let textParts = [];
          if (h.text) textParts.push({ text: h.text });
          if (h.location)
            textParts.push({
              text: `📍 [Shared Location: ${h.location.address || "Unknown"}]`,
            });
          if (h.media && h.media.length > 0)
            textParts.push({ text: `🖼️ [Shared ${h.media.length} images]` });

          if (textParts.length === 0) return null;

          return {
            role:
              h.sender?.role === "ai_assistant" || h.sender === "ai_assistant"
                ? "model"
                : "user",
            parts: textParts,
          };
        })
        .filter((h) => h !== null);

      const chat = model.startChat({
        tools: tools,
        history: chatHistory,
      });

      const result = await chat.sendMessage(currentMessage);
      const response = result.response;
      const call = response.functionCalls();

      if (call) {
        const functionCall = call[0];
        console.log(
          `📡 [AI-DEBUG] Tool called: ${functionCall.name}`,
          functionCall.args,
        );
        let functionResponse;

        if (functionCall.name === "searchUsers") {
          functionResponse = await aiCtrl.searchUsers(functionCall.args.query);
        } else if (functionCall.name === "searchPosts") {
          functionResponse = await aiCtrl.searchPosts(functionCall.args.query);
        } else if (functionCall.name === "searchMarketplace") {
          functionResponse = await aiCtrl.searchMarketplace(
            functionCall.args.query,
          );
        } else if (functionCall.name === "navigateApp") {
          functionResponse = await aiCtrl.navigateApp(
            functionCall.args.screenName,
          );
        }

        console.log(
          `🔋 [AI-DEBUG] Tool response ready. Sending back to model...`,
        );
        const result2 = await chat.sendMessage([
          {
            functionResponse: {
              name: functionCall.name,
              response: { content: functionResponse },
            },
          },
        ]);
        return result2.response.text();
      }

      return response.text();
    } catch (err) {
      console.error("❌ [AI-DEBUG] Controller Error:", err.message);
      if (err.stack) console.error(err.stack);
      return `I'm having trouble processing that right now. (Error: ${err.message})`;
    }
  },
};

module.exports = aiCtrl;
