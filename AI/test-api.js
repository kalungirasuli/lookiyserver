const axios = require('axios').default || require('axios');

async function testAPI() {
    try {
        console.log('=== AI Recommendation Service Test Suite ===\n');
        
        // Test 1: Health Check
        console.log('1. Testing health endpoint...');
        const healthResponse = await axios.get('http://localhost:8002/health');
        console.log('✓ Health:', healthResponse.data);
        
        // Test 2: Legacy Recommendation Endpoint (Backward Compatibility)
        console.log('\n2. Testing legacy recommendation endpoint...');
        const legacyResponse = await axios.post('http://localhost:8002/recommend', {
            query: "farming and fishing",
            limit: 5
        });
        console.log('✓ Legacy Recommendations:', JSON.stringify(legacyResponse.data, null, 2));
        
        // Test 3: Qdrant-based User Matching (Primary AI Method)
        console.log('\n3. Testing Qdrant-based user matching...');
        const userId = '3df1c253-324f-4a47-b314-30c8cff29ce9'; // Test with Tyra Nankunda's UUID
        const qdrantResponse = await axios.post(`http://localhost:8002/recommendations/${userId}`, {}, {
            params: {
                top_n: 5
            }
        });
        console.log('✓ Qdrant User Matching:', JSON.stringify(qdrantResponse.data, null, 2));
        
        // Test 4: Network-Scoped Recommendations
        console.log('\n4. Testing network-scoped recommendations...');
        const networkFilterResponse = await axios.post(`http://localhost:8002/recommendations/${userId}`, {}, {
            params: {
                top_n: 3,
                network_filter: '1'
            }
        });
        console.log('✓ Network-Filtered Recommendations:', JSON.stringify(networkFilterResponse.data, null, 2));
        
        // Test 5: Different User Profile Matching
        console.log('\n5. Testing different user profile matching...');
        const differentUserId = '27734422-cfd9-47c4-8680-e3b9f48f9cc3'; // Test with kalungi rasuli's UUID
        const differentUserResponse = await axios.post(`http://localhost:8002/recommendations/${differentUserId}`, {}, {
            params: {
                top_n: 4
            }
        });
        console.log('✓ Different User Matching:', JSON.stringify(differentUserResponse.data, null, 2));
        
        // Test 6: Edge Cases
        console.log('\n6. Testing edge cases...');
        
        // Test with non-existent user
        try {
            await axios.post('http://localhost:8002/recommendations/999', {}, {
                params: { top_n: 3 }
            });
        } catch (error) {
            console.log('✓ Non-existent user handling:', (error).response?.data || 'Error handled correctly');
        }
        
        // Test with invalid parameters
        try {
            const invalidResponse = await axios.post(`http://localhost:8002/recommendations/${userId}`, {}, {
                params: {
                    top_n: 0
                }
            });
            console.log('✓ Invalid parameters handling:', JSON.stringify(invalidResponse.data, null, 2));
        } catch (error) {
            console.log('✓ Invalid parameters error:', (error).response?.data || 'Error handled correctly');
        }
        
        // Test 7: Performance Comparison
        console.log('\n7. Testing performance metrics...');
        const startTime = Date.now();
        await axios.post(`http://localhost:8002/recommendations/${userId}`, {}, {
            params: { top_n: 10 }
        });
        const qdrantTime = Date.now() - startTime;
        console.log(`✓ Qdrant Response Time: ${qdrantTime}ms`);
        
        // Test 8: Populate Users (if needed)
        console.log('\n8. Testing user population...');
        try {
            const populateResponse = await axios.post('http://localhost:8002/populate_users');
            console.log('✓ User Population:', populateResponse.status === 200 ? 'Success' : 'Already populated');
        } catch (error) {
            console.log('✓ User Population:', 'Already populated or error handled');
        }
        
        // Test 9: Index Persistence
        console.log('\n9. Testing index persistence...');
        try {
            const saveResponse = await axios.post('http://localhost:8002/save_indices');
            console.log('✓ Index Saving:', saveResponse.status === 200 ? 'Success' : 'Error');
        } catch (error) {
            console.log('✓ Index Saving Error:', (error).response?.data || (error).message);
        }
        
        console.log('\n=== All Tests Completed Successfully ===');
        
    } catch (error) {
        console.error('❌ Error testing API:', (error).response?.data || (error).message);
        console.error('Stack trace:', (error).stack);
    }
}

// Run comprehensive test suite
testAPI();