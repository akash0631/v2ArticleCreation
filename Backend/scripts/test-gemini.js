require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testGemini() {
  const apiKey = process.env.GOOGLE_API_KEY;
  console.log('\n🧪 Testing Google Gemini Vision API...');
  console.log(`API Key: ${apiKey?.substring(0, 15)}...${apiKey?.substring(apiKey.length - 5)}`);
  
  if (!apiKey) {
    console.log('❌ GOOGLE_API_KEY not found in environment');
    return false;
  }
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // First, list available models
    console.log('\n📋 Fetching available models...');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    const data = await response.json();
    
    if (data.models) {
      console.log('\n✅ Available Models:');
      data.models.forEach(model => {
        console.log(`   - ${model.name} (${model.displayName})`);
        if (model.supportedGenerationMethods?.includes('generateContent')) {
          console.log(`     ✓ Supports generateContent`);
        }
      });
      
      // Try to find a vision model
      const visionModel = data.models.find(m => 
        m.supportedGenerationMethods?.includes('generateContent') &&
        (m.name.includes('vision') || m.name.includes('pro'))
      );
      
      if (visionModel) {
        const modelName = visionModel.name.replace('models/', '');
        console.log(`\n🎯 Using model: ${modelName}`);
        
        const model = genAI.getGenerativeModel({ model: modelName });
    
    // Simple test with text only
    console.log('\n📝 Test 1: Simple text generation...');
    const result = await model.generateContent('Say "Hello, World!" and nothing else.');
    const response = result.response;
    const text = response.text();
    console.log(`✅ Response: ${text}`);
    console.log(`📊 Tokens used: ${response.usageMetadata?.totalTokenCount || 'N/A'}`);
    
    // Test with a simple base64 image (1x1 red pixel)
    console.log('\n🖼️ Test 2: Image analysis...');
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    
    const imageResult = await model.generateContent([
      'What color is this image? Answer in one word.',
      {
        inlineData: {
          mimeType: 'image/png',
          data: testImageBase64
        }
      }
    ]);
    
    const imageText = imageResult.response.text();
    console.log(`✅ Image Response: ${imageText}`);
    console.log(`📊 Tokens used: ${imageResult.response.usageMetadata?.totalTokenCount || 'N/A'}`);
        
        console.log('\n✅ ========================================');
        console.log('✅ Google Gemini API is WORKING!');
        console.log('✅ ========================================\n');
        return true;
      } else {
        console.log('\n⚠️ No suitable vision model found');
        return false;
      }
    } else {
      console.log('❌ Could not fetch models list');
      return false;
    }
    
  } catch (error) {
    console.log('\n❌ ========================================');
    console.log('❌ Google Gemini API Test FAILED');
    console.log('❌ ========================================');
    console.error('Error:', error.message);
    if (error.status) console.error('Status:', error.status);
    if (error.statusText) console.error('Status Text:', error.statusText);
    if (error.errorDetails) console.error('Details:', JSON.stringify(error.errorDetails, null, 2));
    console.log();
    return false;
  }
}

testGemini();
