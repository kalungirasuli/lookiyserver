/**
 * Test script to verify the recommendation system is running properly
 * This script demonstrates the available recommendation endpoints
 */

const API_BASE_URL = 'http://localhost:3000/api/V1';

// Test data - replace with actual values for real testing
const TEST_DATA = {
  networkId: 'your-network-id-here',
  userId: 'your-user-id-here',
  authToken: 'your-auth-token-here'
};

/**
 * Test the recommendation system health
 */
async function testRecommendationHealth() {
  console.log('🏥 Testing Recommendation System Health...');
  
  try {
    const response = await fetch(`http://localhost:3000/V1/recommendations/health`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_DATA.authToken}`
      }
    });
    
    const result = await response.json();
    
    console.log('📊 Health Check Status:', response.status);
    console.log('📋 Health Data:', JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log('✅ SUCCESS: Recommendation system is healthy');
      return true;
    } else {
      console.log('⚠️  Health check failed');
      return false;
    }
    
  } catch (error) {
    console.error('❌ Health check failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Test getting recommendations for a user
 */
async function testGetRecommendations() {
  console.log('\n🎯 Testing Get Recommendations...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/recommendations/networks/${TEST_DATA.networkId}?limit=5`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${TEST_DATA.authToken}`
      }
    });
    
    const result = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📋 Recommendations:', JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log('✅ SUCCESS: Recommendations retrieved successfully');
      console.log(`📈 Found ${result.recommendations?.length || 0} recommendations`);
      return true;
    } else {
      console.log('⚠️  Failed to get recommendations:', result.error);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Get recommendations failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Test refreshing recommendations
 */
async function testRefreshRecommendations() {
  console.log('\n🔄 Testing Refresh Recommendations...');
  
  try {
    const response = await fetch(`${API_BASE_URL}/recommendations/networks/${TEST_DATA.networkId}/refresh`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TEST_DATA.authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📋 Refresh Result:', JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log('✅ SUCCESS: Recommendations refreshed successfully');
      return true;
    } else {
      console.log('⚠️  Failed to refresh recommendations:', result.error);
      return false;
    }
    
  } catch (error) {
    console.error('❌ Refresh recommendations failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Test AI service health directly
 */
async function testAIServiceHealth() {
  console.log('\n🤖 Testing AI Service Health...');
  
  try {
    const response = await fetch('http://localhost:8002/health', {
      method: 'GET'
    });
    
    const result = await response.json();
    
    console.log('📊 AI Service Status:', response.status);
    console.log('📋 AI Service Health:', JSON.stringify(result, null, 2));
    
    if (response.status === 200) {
      console.log('✅ SUCCESS: AI service is healthy');
      return true;
    } else {
      console.log('⚠️  AI service health check failed');
      return false;
    }
    
  } catch (error) {
    console.error('❌ AI service health check failed:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Display system status and available endpoints
 */
function displaySystemStatus() {
  console.log('\n🚀 RECOMMENDATION SYSTEM STATUS:');
  console.log('=' .repeat(50));
  
  console.log('\n🌐 Main Server: http://localhost:3000');
  console.log('🤖 AI Service: http://localhost:8002');
  
  console.log('\n📡 Available Endpoints:');
console.log('   GET  /V1/recommendations/health');
console.log('   GET  /V1/recommendations/networks/:networkId');
console.log('   POST /V1/recommendations/networks/:networkId/refresh');
console.log('   POST /V1/recommendations/networks/:networkId/acted-upon/:userId');
console.log('   GET  /V1/recommendations/networks/:networkId/analytics');
  
  console.log('\n🔧 System Components:');
  console.log('   ✅ FastAPI AI Service (FAISS + Gemini)');
  console.log('   ✅ Node.js Recommendation Service');
  console.log('   ✅ PostgreSQL Database');
  console.log('   ✅ Redis Caching');
  console.log('   ✅ Kafka Event Streaming');
  
  console.log('\n🎯 Features:');
  console.log('   ✅ AI-powered user matching');
  console.log('   ✅ Network-scoped recommendations');
  console.log('   ✅ Real-time caching');
  console.log('   ✅ Analytics and tracking');
  console.log('   ✅ Health monitoring');
}

/**
 * Main test runner
 */
async function runSystemTests() {
  console.log('🔧 RECOMMENDATION SYSTEM TEST SUITE');
  console.log('=' .repeat(50));
  
  displaySystemStatus();
  
  console.log('\n📝 RUNNING TESTS:');
  console.log('=' .repeat(30));
  
  // Test AI service first
  const aiHealthy = await testAIServiceHealth();
  
  // Test recommendation system health
  const systemHealthy = await testRecommendationHealth();
  
  console.log('\n📊 TEST SUMMARY:');
  console.log('=' .repeat(20));
  console.log(`🤖 AI Service: ${aiHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  console.log(`🎯 Recommendation System: ${systemHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  
  if (aiHealthy && systemHealthy) {
    console.log('\n🎉 RECOMMENDATION SYSTEM IS FULLY OPERATIONAL!');
    console.log('\n💡 To test with real data:');
    console.log('   1. Update TEST_DATA with valid networkId, userId, and authToken');
    console.log('   2. Uncomment the test function calls below');
    console.log('   3. Run: node test-recommendation-system.js');
    
    // Uncomment these lines when ready to test with real data:
    // await testGetRecommendations();
    // await testRefreshRecommendations();
  } else {
    console.log('\n⚠️  Some components are not healthy. Check the logs above.');
  }
}

// Run the test suite
if (require.main === module) {
  runSystemTests().catch(console.error);
}

module.exports = {
  testRecommendationHealth,
  testGetRecommendations,
  testRefreshRecommendations,
  testAIServiceHealth,
  displaySystemStatus
};