# Connection Request Privacy Implementation

## Overview
This implementation adds privacy controls for connection requests, allowing users to restrict who can send them connection requests based on verification status, network membership, or completely disable requests.

## Privacy Settings

Users can now set their `connection_request_privacy` to one of four levels:

1. **`public`** - Anyone can send connection requests (no restrictions)
2. **`network_only`** - Only users in the same network can send requests (default)
3. **`verified_only`** - Only verified users can send connection requests
4. **`none`** - No one can send connection requests (disabled)

## Database Changes

### User Model
Added `connection_request_privacy` field to the User interface:
```typescript
connection_request_privacy: 'public' | 'network_only' | 'verified_only' | 'none';
```

### Migration
Added column to users table:
```sql
connection_request_privacy VARCHAR(20) DEFAULT 'network_only'
```

## API Endpoints

### Get Privacy Settings
```
GET /V1/auth/privacy-settings
Authorization: Bearer {jwt_token}
```

**Response:**
```json
{
  "connection_request_privacy": "network_only",
  "isPublic": true,
  "isVerified": false
}
```

### Update Privacy Settings
```
PUT /V1/auth/privacy-settings
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "connection_request_privacy": "verified_only"
}
```

**Response:**
```json
{
  "message": "Privacy settings updated successfully",
  "connection_request_privacy": "verified_only"
}
```

## Connection Request Logic

The `sendConnectionRequest` function now includes privacy checks:

1. **Network membership** - Both users must be in the same network (existing)
2. **Privacy setting check** - Validates against target user's privacy preference:
   - `none`: Rejects all requests
   - `verified_only`: Requires sender to be verified
   - `network_only`: Requires same network membership (already checked)
   - `public`: No additional restrictions

## Error Messages

The system provides clear error messages for privacy violations:

- `"This user is not accepting connection requests"` (privacy = 'none')
- `"This user only accepts connection requests from verified users"` (privacy = 'verified_only' + sender not verified)
- `"Both users must be members of the network"` (existing network check)

## Implementation Files

### Modified Files:
- `src/models/database.ts` - Added privacy field to User interface
- `src/utils/migrations.ts` - Added database column
- `src/controllers/connectionController.ts` - Added privacy validation logic
- `src/controllers/authController.ts` - Added privacy settings endpoints
- `src/routes/auth.ts` - Added privacy routes

### Key Functions:
- `sendConnectionRequest()` - Enhanced with privacy checks
- `getPrivacySettings()` - Fetch user's privacy settings
- `updatePrivacySettings()` - Update user's privacy preferences

## Testing Examples

### Test Privacy Settings
```bash
# Get current privacy settings
curl -X GET "http://localhost:3000/V1/auth/privacy-settings" \
  -H "Authorization: Bearer {jwt_token}"

# Set to verified users only
curl -X PUT "http://localhost:3000/V1/auth/privacy-settings" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{"connection_request_privacy": "verified_only"}'

# Disable all connection requests
curl -X PUT "http://localhost:3000/V1/auth/privacy-settings" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{"connection_request_privacy": "none"}'
```

### Test Connection Request with Privacy
```bash
# This will now check the target user's privacy settings
curl -X POST "http://localhost:3000/V1/connections/{networkId}/requests/{userId}" \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi! Let\'s connect!"}'
```

## Security Features

- ✅ **Authentication required** for all privacy endpoints
- ✅ **Input validation** for privacy setting values
- ✅ **Database constraints** with proper defaults
- ✅ **Comprehensive logging** for privacy changes
- ✅ **Backward compatibility** with existing connections

## Default Behavior

- New users default to `network_only` privacy setting
- Existing users will get `network_only` when the migration runs
- The system maintains backward compatibility with existing connection logic

## Benefits

1. **User Control** - Users can control their connection request experience
2. **Spam Prevention** - Reduces unwanted connection requests
3. **Verification Incentive** - Encourages users to get verified for broader access
4. **Flexible Privacy** - Multiple levels to suit different user preferences
5. **Clear Feedback** - Users get clear error messages when requests are blocked

This implementation fully addresses the requirement from the issues.md file for users to "restrict connection requests to only users in the same network/non/verified users only/make it public any one can send them connection requests."