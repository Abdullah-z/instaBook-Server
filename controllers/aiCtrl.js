const { GoogleGenerativeAI } = require("@google/generative-ai");

const aiCtrl = {
  generateAIResponse: async (history, currentMessage) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return "I'm sorry, my Gemini API key is not configured. Please check the server settings.";
      }

      // Verify the key on Railway (safety log)
      const keyPrefix = apiKey.substring(0, 4);
      const keySuffix = apiKey.substring(apiKey.length - 4);
      console.log(`🔑 AI Bot is using key: ${keyPrefix}...${keySuffix}`);

      const genAI = new GoogleGenerativeAI(apiKey);

      // 1. Clean and Format History
      let formattedHistory = [];
      if (history && history.length > 0) {
        formattedHistory = history
          .filter((msg) => msg.text && msg.text.trim().length > 0)
          .map((msg) => ({
            role: msg.sender?.role === "ai_assistant" ? "model" : "user",
            parts: [{ text: msg.text }],
          }));

        // Gemini requires the first message to be from the 'user'
        const firstUserIndex = formattedHistory.findIndex(
          (h) => h.role === "user"
        );
        if (firstUserIndex !== -1) {
          formattedHistory = formattedHistory.slice(firstUserIndex);
        } else {
          formattedHistory = [];
        }
      }

      console.log(
        `🤖 Requesting response (History: ${formattedHistory.length} messages)`
      );

      // 2. Models found in your diagnostic output + standard defaults
      const modelsToTry = [
        "gemini-2.0-flash", // Seen in diagnostic
        "gemini-2.0-flash-exp", // Seen in diagnostic
        "gemini-1.5-flash", // Standard
        "gemini-pro", // Legacy Fallback
      ];

      for (const modelId of modelsToTry) {
        try {
          console.log(`📡 Trying model: ${modelId}...`);
          const model = genAI.getGenerativeModel({ model: modelId });

          let responseText = "";

          // Try with history context first
          try {
            if (formattedHistory.length > 0) {
              const chat = model.startChat({ history: formattedHistory });
              const result = await chat.sendMessage(currentMessage);
              responseText = result.response.text();
            } else {
              const result = await model.generateContent(currentMessage);
              responseText = result.response.text();
            }
          } catch (chatErr) {
            // If chat/history session fails, try a direct single-turn generation
            console.warn(
              `⚠️ Chat session failed for ${modelId}, trying direct generation: ${chatErr.message}`
            );
            const result = await model.generateContent(currentMessage);
            responseText = result.response.text();
          }

          if (responseText) {
            console.log(`✅ Success with ${modelId}!`);
            return responseText;
          }
        } catch (apiErr) {
          console.warn(`❌ Model ${modelId} failed: ${apiErr.message}`);

          // One last attempt with the full 'models/' prefix if it failed
          if (!modelId.startsWith("models/")) {
            try {
              const prefixedId = `models/${modelId}`;
              console.log(`📡 Retrying with prefix: ${prefixedId}...`);
              const model = genAI.getGenerativeModel({ model: prefixedId });
              const result = await model.generateContent(currentMessage);
              responseText = result.response.text();
              if (responseText) {
                console.log(`✅ Success with ${prefixedId}!`);
                return responseText;
              }
            } catch (innerErr) {
              console.warn(`⚠️ Prefix retry failed for ${modelId}`);
            }
          }
          continue; // Try next model in loop
        }
      }

      return "I'm still having a hard time finding a model that works with your account. Please check your Railway 'GEMINI_API_KEY' environment variable.";
    } catch (err) {
      console.error("❌ Gemini Controller Error:", err.message);
      return "My brain is having a bit of a crisis. Please try again later.";
    }
  },
};

module.exports = aiCtrl;
