const { OpenAI } = require("openai");

async function testOpenAIConnection() {
  try {
    // Create OpenAI client
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true // Allow running in browser environment if needed
    });
    
    console.log("Testing OpenAI Connection...");
    
    // Try a simple completion to test the connection
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that responds with only 'OK' to test the connection."
        },
        {
          role: "user",
          content: "Test connection"
        }
      ],
      max_tokens: 5
    });
    
    console.log("SUCCESS! Connection to OpenAI API is working. Response:");
    console.log(response.choices[0].message.content);
    return true;
  } catch (error) {
    console.error("ERROR: Failed to connect to OpenAI API");
    console.error("Error details:", error);
    return false;
  }
}

// Run the test
testOpenAIConnection();