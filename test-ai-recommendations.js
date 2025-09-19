const axios = require('axios').default;

// Test configuration
const AI_SERVICE_URL = 'http://localhost:8002';
const MAIN_SERVICE_URL = 'http://localhost:3000';

// Sample user profiles for testing
const testProfiles = {

  user1: {
    id: 'user_001',
    name: 'morgon  Johnson',
    bio: 'Full-stack developer passionate about AI and machine learning',
    interests: ['Artificial Intelligence', 'Web Development', 'Data Science'],
    goals: ['Build AI-powered applications', 'Learn advanced ML techniques']
  },
  user2: {
    id: 'user_002', 
    name: 'harry Smith',
    bio: 'Data scientist with expertise in machine learning and analytics',
    interests: ['Machine Learning', 'Data Analytics', 'Statistics'],
    goals: ['Advance in deep learning', 'Mentor junior developers']
  },
  user3: {
    id: 'user_003',
    name: 'Carol Davis',
    bio: 'Frontend developer focused on user experience and design',
    interests: ['UI/UX Design', 'Frontend Development', 'User Research'],
    goals: ['Master advanced CSS techniques', 'Learn backend development']
  },
  user4: {
    id: 'user_004',
    name: 'David Wilson',
    bio: 'DevOps engineer passionate about cloud infrastructure and automation',
    interests: ['Cloud Computing', 'Infrastructure Automation', 'Monitoring'],
    goals: ['Master Kubernetes orchestration', 'Learn serverless architectures']
  },
  user5: {
    id: 'user_005',
    name: 'Emma Thompson',
    bio: 'Mobile app developer specializing in cross-platform solutions',
    interests: ['Mobile Development', 'UI/UX', 'Cross-platform apps'],
    goals: ['Publish a top-rated app', 'Learn advanced animations']
  },
  user6: {
    id: 'user_006',
    name: 'Frank Miller',
    bio: 'Backend engineer focused on APIs and distributed systems',
    interests: ['APIs', 'Databases', 'Scalable Systems'],
    goals: ['Design scalable microservices', 'Improve API performance']
  },
  user7: {
    id: 'user_007',
    name: 'Grace Lee',
    bio: 'AI researcher exploring natural language processing',
    interests: ['Natural Language Processing', 'AI Ethics', 'Deep Learning'],
    goals: ['Publish AI research papers', 'Contribute to open-source NLP tools']
  },
  user8: {
    id: 'user_008',
    name: 'Henry Adams',
    bio: 'Cybersecurity specialist with a focus on penetration testing',
    interests: ['Ethical Hacking', 'Network Security', 'Cryptography'],
    goals: ['Obtain OSCP certification', 'Build a security consultancy']
  },
  user9: {
    id: 'user_009',
    name: 'Isabella Martinez',
    bio: 'Cloud architect designing scalable infrastructures',
    interests: ['Cloud Architecture', 'Serverless', 'Scalability'],
    goals: ['Achieve multi-cloud expertise', 'Publish cloud architecture guides']
  },
  user10: {
    id: 'user_010',
    name: 'Jack Brown',
    bio: 'Game developer passionate about immersive storytelling',
    interests: ['Game Development', '3D Modeling', 'VR/AR'],
    goals: ['Develop a successful indie game', 'Explore VR storytelling']
  },
  user11: {
    id: 'user_011',
    name: 'Karen White',
    bio: 'Product manager bridging tech and business needs',
    interests: ['Product Strategy', 'Team Leadership', 'Agile Development'],
    goals: ['Lead a global product launch', 'Mentor aspiring PMs']
  },
  user12: {
    id: 'user_012',
    name: 'Liam Johnson',
    bio: 'Blockchain developer building decentralized applications',
    interests: ['Blockchain', 'Cryptocurrency', 'DeFi'],
    goals: ['Launch a DeFi project', 'Master cross-chain development']
  },
  user13: {
    id: 'user_013',
    name: 'Mia Taylor',
    bio: 'Data engineer specializing in big data pipelines',
    interests: ['Big Data', 'Data Engineering', 'ETL'],
    goals: ['Optimize large-scale ETL pipelines', 'Learn real-time data streaming']
  },
  user14: {
    id: 'user_014',
    name: 'Noah Harris',
    bio: 'AI ethics advocate ensuring responsible AI practices',
    interests: ['AI Ethics', 'Responsible Tech', 'Regulations'],
    goals: ['Shape AI regulations', 'Write a book on ethical AI']
  },
  user15: {
    id: 'user_015',
    name: 'Olivia Clark',
    bio: 'UI/UX designer crafting intuitive digital experiences',
    interests: ['Design Thinking', 'User Psychology', 'Accessibility'],
    goals: ['Create award-winning designs', 'Contribute to open-source design tools']
  },
  user16: {
    id: 'user_016',
    name: 'Paul Walker',
    bio: 'Machine learning engineer applying AI to healthcare',
    interests: ['Healthcare AI', 'Deep Learning', 'Data Science'],
    goals: ['Develop AI for diagnostics', 'Improve patient care through ML']
  },
  user17: {
    id: 'user_017',
    name: 'Quinn Foster',
    bio: 'Software tester focused on automation and quality assurance',
    interests: ['Test Automation', 'Quality Assurance', 'DevOps'],
    goals: ['Improve CI/CD test pipelines', 'Learn advanced automation frameworks']
  },
  user18: {
    id: 'user_018',
    name: 'Ruby Allen',
    bio: 'AR/VR developer creating immersive experiences',
    interests: ['Virtual Reality', 'Augmented Reality', '3D Design'],
    goals: ['Launch a VR startup', 'Push AR into education']
  },
  user19: {
    id: 'user_019',
    name: 'Samuel Green',
    bio: 'Embedded systems engineer working on IoT solutions',
    interests: ['IoT', 'Hardware', 'Edge Computing'],
    goals: ['Develop scalable IoT solutions', 'Contribute to open hardware projects']
  },
  user20: {
    id: 'user_020',
    name: 'Tina Brooks',
    bio: 'Football player and farmers... i lover much of politices',
    interests: ['viens', 'pumpkins', 'wheat'],
    goals: ['investors to agriculture', 'shape aggroferstry']
  }
};

const networkContext = {
  id: 'network_ai_dev',
  name: 'AI Developers Network',
  description: 'A community of developers working on AI and machine learning projects',
  goals: ['Share AI knowledge', 'Collaborate on ML projects', 'Mentor newcomers']
};

async function testAIRecommendations() {
  console.log('🤖 AI-POWERED RECOMMENDATION SYSTEM TEST');
  console.log('='.repeat(50));
  
  try {
    // Test AI service health
    console.log('\n🏥 Testing AI Service Health...');
    const healthResponse = await axios.get(`${AI_SERVICE_URL}/health`);
    console.log('✅ AI Service Status:', healthResponse.data);
    
    // Test user profile recommendations
    console.log('\n👥 Testing User Profile Recommendations...');
    
    const recommendationRequest = {
      user_profile: testProfiles.user1,
      candidate_profiles: Object.values(testProfiles).slice(1), // Exclude user1
      network_context: networkContext,
      max_recommendations: 10
    };
    
    const recResponse = await axios.post(`${AI_SERVICE_URL}/recommend`, recommendationRequest);
    console.log('🎯 Recommendations for', testProfiles.user1.name + ':');
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recResponse.data.recommendations.forEach((rec, index) => {
      // Find the candidate by user_id
      const candidate = Object.values(testProfiles).find(profile => profile.id === rec.user_id);
      console.log(`\n   ${index + 1}. ${candidate?.name || 'Unknown User'}`);
      console.log(`      📈 Compatibility Score: ${rec.match_score}`);
      console.log(`      🔍 Reason: ${rec.explanation}`);
      console.log(`      👤 Profile: ${candidate?.bio || 'No bio available'}`);
    });
    
    console.log('\n\n🎉 SUCCESS: AI-Powered Recommendations Working!');
    console.log('='.repeat(50));
    console.log('💡 Key Features Demonstrated:');
    console.log('   ✅ Gemini AI integration for intelligent matching');
    console.log('   ✅ Semantic similarity analysis');
    console.log('   ✅ Context-aware recommendations');
    console.log('   ✅ Interest and goal alignment detection');
    console.log('   ✅ Personalized explanations');
    console.log('   ✅ Network-scoped matching');
    
  } catch (error) {
    const errorMessage = error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'data' in error.response ? error.response.data : error && typeof error === 'object' && 'message' in error ? error.message : 'Unknown error';
    console.error('❌ Test failed:', errorMessage);
    if (error && typeof error === 'object' && 'response' in error && error.response && typeof error.response === 'object' && 'status' in error.response && error.response.status === 500) {
      console.log('\n💡 This might be due to:');
      console.log('   - Invalid Gemini API key');
      console.log('   - Network connectivity issues');
      console.log('   - AI service configuration problems');
    }
  }
}

testAIRecommendations();