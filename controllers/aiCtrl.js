const { GoogleGenerativeAI } = require("@google/generative-ai");
const Users = require("../models/userModel");
const Posts = require("../models/postModel");
const Listings = require("../models/listingModel");
const Reminders = require("../models/reminderModel");
const axios = require("axios");
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
        .lean();

      console.log(`✅ [AI-DEBUG] Found ${users.length} users.`);
      return users.length > 0
        ? users.map((u) => ({ ...u, _id: u._id.toString() }))
        : "No users found matching that query.";
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
            _id: p._id.toString(),
            content: p.content,
            author: p.user?.username,
            date: p.createdAt,
            image: p.images?.[0]?.url || p.images?.[0], // Handle both object and string formats
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
            _id: l._id.toString(),
            name: l.name,
            price: l.price,
            description: l.description,
            address: l.address,
            image: l.images?.[0],
          }))
        : "No marketplace listings found matching that query.";
    } catch (err) {
      console.error(`❌ [AI-DEBUG] Error searching marketplace:`, err.message);
      return "Error searching marketplace.";
    }
  },

  getWeather: async (city) => {
    try {
      console.log(`🌦️ [AI-DEBUG] Getting weather for: ${city}`);
      const apiKey = "6cc098a44449cf3468d194cae0f91b47";
      const res = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`,
      );
      return {
        temp: res.data.main.temp,
        condition: res.data.weather[0].description,
        humidity: res.data.main.humidity,
        city: res.data.name,
      };
    } catch (err) {
      return `Error fetching weather: ${err.message}`;
    }
  },

  getNews: async () => {
    try {
      console.log(`📰 [AI-DEBUG] Fetching top news`);
      const apiKey = "25b905674f0149bd819b4f8e242f7350";
      const res = await axios.get(
        `https://newsapi.org/v2/top-headlines?country=us&apiKey=${apiKey}`,
      );
      return res.data.articles.slice(0, 5).map((a) => ({
        title: a.title,
        source: a.source.name,
        url: a.url,
      }));
    } catch (err) {
      return `Error fetching news: ${err.message}`;
    }
  },

  generateAIImage: async (prompt) => {
    try {
      console.log(
        `🎨 [AI-DEBUG] Attempting generation with Nano Banana Pro: ${prompt}`,
      );
      const apiKey = process.env.GEMINI_API_KEY;
      const genAI = new GoogleGenerativeAI(apiKey);

      // Use the specific experimental model ID for direct image generation
      const model = genAI.getGenerativeModel({
        model: "nano-banana-pro-preview",
      });

      // Image generation models usually expect the prompt
      const result = await model.generateContent(prompt);
      const response = await result.response;

      // Check if the response contains raw image data (InlineData)
      const parts = response.candidates?.[0]?.content?.parts || [];
      const imagePart = parts.find(
        (p) => p.inlineData && p.inlineData.mimeType.startsWith("image/"),
      );

      if (imagePart) {
        console.log(
          `✅ [AI-DEBUG] Native image generated! Uploading to Cloudinary...`,
        );
        const base64Data = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;

        const uploadRes = await cloudinary.uploader.upload(base64Data, {
          folder: "ai_generated",
        });

        return `AI_IMAGE_URL:${uploadRes.secure_url}`;
      }

      console.log(
        `⚠️ [AI-DEBUG] Nano Banana returned no image data. Falling back to Pollinations...`,
      );
    } catch (err) {
      console.warn(
        "⚠️ Native image generation failed (likely preview quota or SDK support):",
        err.message,
      );
    }

    // Fallback engine: Pollinations (Flux)
    const encodedPrompt = encodeURIComponent(prompt);
    const imageUrl = `https://pollinations.ai/p/${encodedPrompt}?width=1024&height=1024&seed=${Math.floor(
      Math.random() * 1000,
    )}&model=flux`;

    return `AI_IMAGE_URL:${imageUrl}`;
  },

  findDeals: async (query) => {
    try {
      console.log(`💰 [AI-DEBUG] Finding deals for: ${query}`);
      const listings = await Listings.find({
        $or: [
          { name: { $regex: query, $options: "i" } },
          { description: { $regex: query, $options: "i" } },
        ],
      })
        .sort("price")
        .limit(3)
        .lean();

      return listings.length > 0
        ? listings.map((l) => ({
            _id: l._id.toString(),
            name: l.name,
            price: l.price,
            description: l.description,
            address: l.address,
            image: l.images?.[0],
            link: `ListingDetail:${l._id}`,
          }))
        : "No deals found for that search.";
    } catch (err) {
      return `Error finding deals: ${err.message}`;
    }
  },

  scheduleReminder: async (userId, text, timeInMinutes) => {
    try {
      console.log(
        `⏰ [AI-DEBUG] Scheduling reminder for user ${userId}: ${text} in ${timeInMinutes}m`,
      );

      // Duplicate prevention: check if a similar reminder was created in the last 30 seconds
      const existing = await Reminders.findOne({
        user: userId,
        text,
        createdAt: { $gte: new Date(Date.now() - 30000) },
      });

      if (existing) {
        console.log(
          "⚠️ [AI-DEBUG] Duplicate reminder detected, skipping DB save but returning command.",
        );
        return `COMMAND:REMINDER:${timeInMinutes}:${text}`;
      }

      const remindAt = new Date(Date.now() + timeInMinutes * 60000);
      const reminder = new Reminders({
        user: userId,
        text,
        remindAt,
      });
      await reminder.save();
      // Return a special command string for the frontend to schedule a Local Notification
      return `COMMAND:REMINDER:${timeInMinutes}:${text}`;
    } catch (err) {
      return `Error scheduling reminder: ${err.message}`;
    }
  },

  navigateApp: async (screenName) => {
    console.log(`🤖 [AI-DEBUG] Navigation triggered for: "${screenName}"`);
    // Return a special command string that the frontend will interpret
    return `COMMAND:NAVIGATE:${screenName}`;
  },

  generateAIResponse: async (
    history,
    currentMessage,
    currentUserId,
    clientTime,
  ) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        console.error("❌ [AI-DEBUG] GEMINI_API_KEY is missing!");
        return "I'm sorry, my Gemini API key is not configured.";
      }

      console.log(`🤖 [AI-DEBUG] Generating response for: "${currentMessage}"`);
      const genAI = new GoogleGenerativeAI(apiKey);

      const modelNames = [
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash",
        "gemini-3-flash-preview",
        "gemini-2.5-flash",
        "gemini-2.5-flash-preview-tts",
        "gemini-flash-latest",
        "gemini-flash-lite-latest",
        "gemini-exp-1206",
        "gemini-2.0-flash-lite-preview",
        "gemini-2.0-flash-001",
        "gemma-3-27b-it", // 14,000+ RPD fallback
        "gemma-3-12b-it",
      ];
      let lastError = null;

      // Fix history mapping: ensure text is always a string and role is correct
      const mappedHistory = history
        .map((h) => {
          let textParts = [];

          // Ensure we have at least SOME text for each part
          if (h.text && h.text.trim()) {
            textParts.push({ text: h.text });
          }

          if (h.location) {
            textParts.push({
              text: `📍 [Shared Location: ${h.location.address || "Unknown"}]`,
            });
          }

          if (h.media && h.media.length > 0) {
            textParts.push({ text: `🖼️ [Shared ${h.media.length} images]` });
          }

          // Gemini history requires at least one part with text
          if (textParts.length === 0) {
            return null;
          }

          return {
            role:
              h.sender?.role === "ai_assistant" || h.sender === "ai_assistant"
                ? "model"
                : "user",
            parts: textParts,
          };
        })
        .filter((h) => h !== null);

      // Validate and clean history for Gemini:
      // 1. Must start with 'user'
      // 2. Must alternate roles (User, Model, User, Model...)
      let validatedHistory = [];
      for (const msg of mappedHistory) {
        if (validatedHistory.length === 0) {
          if (msg.role === "user") validatedHistory.push(msg);
        } else {
          const lastMsg = validatedHistory[validatedHistory.length - 1];
          if (lastMsg.role !== msg.role) {
            validatedHistory.push(msg);
          } else {
            // Merge parts if roles are same
            lastMsg.parts = lastMsg.parts.concat(msg.parts);
          }
        }
      }

      for (const modelId of modelNames) {
        try {
          console.log(`📡 [AI-DEBUG] Trying model: ${modelId}`);

          // Gemma models do NOT support tool calling/system instructions in the same way
          const isGemma = modelId.startsWith("gemma");

          const modelConfigs = {
            model: modelId,
          };

          if (!isGemma) {
            modelConfigs.systemInstruction = `You are the Official AI Assistant for instaBook, a social media app. 
            Your name is Capricon AI.
            The current date and time is ${
              clientTime
                ? new Date(clientTime).toLocaleString()
                : new Date().toLocaleString()
            }.
            User's Local Time: ${clientTime || "Unknown"}
            Server Time: ${new Date().toLocaleString()}
            
            Always calculate relative times (e.g., "in 10 minutes") based on the provided current date and time.
            If a user says "remind me at 10 PM", calculate how many minutes from NOW (${
              clientTime || new Date().toISOString()
            }) that is.
            
            You have access to tools for search, navigation, weather, news, image generation, and reminders.
            
            Available Screens for Navigation:
            - Marketplace, Map, Discover, Notifications, Profile, CreatePost, CreateListing
            
            REMINDERS:
            When a user asks to be reminded (e.g., "remind me to check marketplace in 10 minutes"), use 'scheduleReminder'.
            
            IMAGE GENERATION:
            When a user asks to generate/create an image, use 'generateAIImage'. Tell the user you've generated the image and it will appear in the chat.
            
            WEATHER & NEWS:
            Provide real-time updates using 'getWeather' and 'getNews'.
            
            DEAL FINDER:
            If a user wants the cheapest items or "best deals", use 'findDeals'.
            
            IMPORTANT: If you use 'navigateApp' or 'scheduleReminder', include the COMMAND string in your final response.`;
          }

          const model = genAI.getGenerativeModel(modelConfigs);

          // Simple tool definitions for Gemini 1.5/2.x
          const tools = isGemma
            ? []
            : [
                {
                  functionDeclarations: [
                    {
                      name: "searchUsers",
                      description: "Search for users by username or fullname",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          query: {
                            type: "STRING",
                            description: "The search term",
                          },
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
                          query: {
                            type: "STRING",
                            description: "The search term",
                          },
                        },
                        required: ["query"],
                      },
                    },
                    {
                      name: "searchMarketplace",
                      description:
                        "Search for items for sale in the marketplace",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          query: {
                            type: "STRING",
                            description: "The search term",
                          },
                        },
                        required: ["query"],
                      },
                    },
                    {
                      name: "navigateApp",
                      description: "Navigate the user to a specific screen",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          screenName: { type: "STRING" },
                        },
                        required: ["screenName"],
                      },
                    },
                    {
                      name: "getWeather",
                      description: "Get current weather for a city",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          city: { type: "STRING" },
                        },
                        required: ["city"],
                      },
                    },
                    {
                      name: "getNews",
                      description: "Get top headlines",
                    },
                    {
                      name: "generateAIImage",
                      description: "Generate an image based on a prompt",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          prompt: { type: "STRING" },
                        },
                        required: ["prompt"],
                      },
                    },
                    {
                      name: "findDeals",
                      description:
                        "Find the best deals/lowest prices in marketplace",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          query: { type: "STRING" },
                        },
                        required: ["query"],
                      },
                    },
                    {
                      name: "scheduleReminder",
                      description: "Set a reminder for the user",
                      parameters: {
                        type: "OBJECT",
                        properties: {
                          text: { type: "STRING" },
                          timeInMinutes: { type: "NUMBER" },
                        },
                        required: ["text", "timeInMinutes"],
                      },
                    },
                  ],
                },
              ];

          const chat = model.startChat({
            tools: isGemma ? undefined : tools,
            history: validatedHistory,
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
              functionResponse = await aiCtrl.searchUsers(
                functionCall.args.query,
              );
            } else if (functionCall.name === "searchPosts") {
              functionResponse = await aiCtrl.searchPosts(
                functionCall.args.query,
              );
            } else if (functionCall.name === "searchMarketplace") {
              functionResponse = await aiCtrl.searchMarketplace(
                functionCall.args.query,
              );
            } else if (functionCall.name === "navigateApp") {
              functionResponse = await aiCtrl.navigateApp(
                functionCall.args.screenName,
              );
            } else if (functionCall.name === "getWeather") {
              functionResponse = await aiCtrl.getWeather(
                functionCall.args.city,
              );
            } else if (functionCall.name === "getNews") {
              functionResponse = await aiCtrl.getNews();
            } else if (functionCall.name === "generateAIImage") {
              functionResponse = await aiCtrl.generateAIImage(
                functionCall.args.prompt,
              );
            } else if (functionCall.name === "findDeals") {
              functionResponse = await aiCtrl.findDeals(
                functionCall.args.query,
              );
            } else if (functionCall.name === "scheduleReminder") {
              functionResponse = await aiCtrl.scheduleReminder(
                currentUserId,
                functionCall.args.text,
                functionCall.args.timeInMinutes,
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

            // Format results for the frontend if it's a search tool
            let searchResults = null;
            let weatherData = null;

            if (functionCall.name === "getWeather") {
              weatherData = functionResponse;
            }

            if (Array.isArray(functionResponse)) {
              searchResults = functionResponse.map((item) => ({
                ...item,
                type:
                  functionCall.name === "searchUsers"
                    ? "user"
                    : functionCall.name === "searchPosts"
                      ? "post"
                      : "listing",
              }));
            }

            return {
              text: result2.response.text(),
              searchResults,
              weatherData,
            };
          }

          return {
            text: response.text(),
            searchResults: null,
            weatherData: null,
          };
        } catch (modelErr) {
          console.warn(
            `⚠️ [AI-DEBUG] Model ${modelId} failed:`,
            modelErr.message,
          );
          lastError = modelErr;
          // Continue to next model on ANY error (404, 429, etc.)
          continue;
        }
      }

      // If we reach here, all models failed.
      // Check if the last error was a quota issue to provide a helpful message.
      if (
        lastError &&
        (lastError.message.includes("429") ||
          lastError.message.includes("quota"))
      ) {
        return {
          text: "I've reached my daily limits across all available AI models. Please try again in a few hours! (Google AI Free Tier limits apply)",
          searchResults: null,
          weatherData: null,
        };
      }

      throw lastError || new Error("All models failed to respond.");
    } catch (err) {
      console.error("❌ [AI-DEBUG] Global Error:", err.message);
      return {
        text: `I'm having trouble processing that right now. (Error: ${err.message})`,
        searchResults: null,
        weatherData: null,
      };
    }
  },
};

module.exports = aiCtrl;
