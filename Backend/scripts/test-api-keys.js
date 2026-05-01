require('dotenv').config();

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('\n🔑 Testing OpenAI API Key...');
  console.log(`Key preview: ${apiKey?.substring(0, 20)}...${apiKey?.substring(apiKey.length - 10)}`);
  
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (response.ok) {
      console.log('✅ OpenAI API Key is VALID');
      return true;
    } else {
      const error = await response.json();
      console.log('❌ OpenAI API Key is INVALID:', error.error?.message || response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ OpenAI API request failed:', error.message);
    return false;
  }
}

async function testAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('\n🔑 Testing Anthropic API Key...');
  console.log(`Key preview: ${apiKey?.substring(0, 20)}...${apiKey?.substring(apiKey.length - 10)}`);
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      })
    });
    
    if (response.ok || response.status === 400) {
      console.log('✅ Anthropic API Key is VALID');
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Anthropic API Key is INVALID:', error.error?.message || response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ Anthropic API request failed:', error.message);
    return false;
  }
}

async function testGoogle() {
  const apiKey = process.env.GOOGLE_API_KEY;
  console.log('\n🔑 Testing Google API Key...');
  console.log(`Key preview: ${apiKey?.substring(0, 20)}...${apiKey?.substring(apiKey.length - 10)}`);
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    
    if (response.ok) {
      console.log('✅ Google API Key is VALID');
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Google API Key is INVALID:', error.error?.message || response.statusText);
      return false;
    }
  } catch (error) {
    console.log('❌ Google API request failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('🧪 API Key Validation Test');
  console.log('========================================');
  
  const results = {
    openai: await testOpenAI(),
    anthropic: await testAnthropic(),
    google: await testGoogle()
  };
  
  console.log('\n========================================');
  console.log('📊 Test Results:');
  console.log('========================================');
  console.log(`OpenAI:    ${results.openai ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`Anthropic: ${results.anthropic ? '✅ VALID' : '❌ INVALID'}`);
  console.log(`Google:    ${results.google ? '✅ VALID' : '❌ INVALID'}`);
  
  const validCount = Object.values(results).filter(Boolean).length;
  console.log(`\n🎯 ${validCount}/3 API keys are valid`);
  
  if (validCount === 0) {
    console.log('\n⚠️  ALL API KEYS ARE INVALID!');
    console.log('Please update your .env file with valid API keys.');
    console.log('\nTo get API keys:');
    console.log('- OpenAI: https://platform.openai.com/api-keys');
    console.log('- Anthropic: https://console.anthropic.com/settings/keys');
    console.log('- Google: https://ai.google.dev/');
  }
}

main();
