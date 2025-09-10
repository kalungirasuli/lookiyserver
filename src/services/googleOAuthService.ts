import sql from '../utils/db';
import { 
  GoogleUserTemp, 
  GoogleUserRegistrationState, 
  GoogleUserRegistrationTempData,
  GoogleRegistrationSteps,
  User
} from '../models/database';
import { v4 as uuidv4 } from 'uuid';

export class GoogleOAuthService {
  // Create or update temporary Google user
  static async createOrUpdateGoogleUserTemp(googleData: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }): Promise<GoogleUserTemp> {
    const { googleId, email, name, picture } = googleData;
    
    const existingUser = await sql`
      SELECT * FROM google_users_temp 
      WHERE google_id = ${googleId}
    `;

    if (existingUser.length > 0) {
      // Update existing temp user
      const updated = await sql`
        UPDATE google_users_temp 
        SET email = ${email}, name = ${name}, profile_pic = ${picture}, updated_at = NOW()
        WHERE google_id = ${googleId}
        RETURNING *
      `;
      return updated[0] as GoogleUserTemp;
    } else {
      // Create new temp user
      const created = await sql`
        INSERT INTO google_users_temp (id, google_id, email, name, profile_pic, created_at, updated_at)
        VALUES (${uuidv4()}, ${googleId}, ${email}, ${name}, ${picture}, NOW(), NOW())
        RETURNING *
      `;
      return created[0] as GoogleUserTemp;
    }
  }

  // Check if Google user exists in main users table
  static async findExistingGoogleUser(googleId: string): Promise<User | null> {
    const users = await sql`
      SELECT * FROM users 
      WHERE google_id = ${googleId} AND is_google_user = true
    `;
    return users.length > 0 ? users[0] as User : null;
  }

  // Check if email exists in main users table (for linking accounts)
  static async findUserByEmail(email: string): Promise<User | null> {
    const users = await sql`
      SELECT * FROM users 
      WHERE email = ${email}
    `;
    return users.length > 0 ? users[0] as User : null;
  }

  // Get or create registration state for Google user
  static async getOrCreateRegistrationState(tempUserId: string): Promise<GoogleUserRegistrationState> {
    const existing = await sql`
      SELECT * FROM google_user_registration_state 
      WHERE user_id = ${tempUserId}
    `;

    if (existing.length > 0) {
      return existing[0] as GoogleUserRegistrationState;
    }

    // Create new registration state with all steps incomplete
    const initialSteps: GoogleRegistrationSteps = {
      basic_info: true, // Already have from Google
      bio: false,
      interests: false,
      location: false,
      phone: false,
      privacy_settings: false,
      profile_completion: false
    };

    const created = await sql`
      INSERT INTO google_user_registration_state (id, user_id, step_completed, is_complete, created_at, updated_at)
      VALUES (${uuidv4()}, ${tempUserId}, ${JSON.stringify(initialSteps)}, false, NOW(), NOW())
      RETURNING *
    `;
    return created[0] as GoogleUserRegistrationState;
  }

  // Update registration step completion
  static async updateRegistrationStep(
    tempUserId: string, 
    step: keyof GoogleRegistrationSteps, 
    completed: boolean = true
  ): Promise<void> {
    const state = await this.getOrCreateRegistrationState(tempUserId);
    const steps = state.step_completed as GoogleRegistrationSteps;
    steps[step] = completed;

    // Check if all steps are complete
    const isComplete = Object.values(steps).every(Boolean);

    await sql`
      UPDATE google_user_registration_state 
      SET step_completed = ${JSON.stringify(steps)}, is_complete = ${isComplete}, updated_at = NOW()
      WHERE user_id = ${tempUserId}
    `;
  }

  // Save temporary registration data
  static async saveTempRegistrationData(
    tempUserId: string, 
    data: Partial<GoogleUserRegistrationTempData>
  ): Promise<void> {
    const existing = await sql`
      SELECT * FROM google_user_registration_temp_data 
      WHERE user_id = ${tempUserId}
    `;

    if (existing.length > 0) {
      // Update existing data
      const updateFields = [];
      const updateValues = [];
      
      if (data.bio !== undefined) {
        updateFields.push('bio = $' + (updateValues.length + 1));
        updateValues.push(data.bio);
      }
      if (data.interests !== undefined) {
        updateFields.push('interests = $' + (updateValues.length + 1));
        updateValues.push(data.interests);
      }
      if (data.location !== undefined) {
        updateFields.push('location = $' + (updateValues.length + 1));
        updateValues.push(data.location);
      }
      if (data.phone !== undefined) {
        updateFields.push('phone = $' + (updateValues.length + 1));
        updateValues.push(data.phone);
      }
      if (data.description !== undefined) {
        updateFields.push('description = $' + (updateValues.length + 1));
        updateValues.push(data.description);
      }
      if (data.is_public !== undefined) {
        updateFields.push('is_public = $' + (updateValues.length + 1));
        updateValues.push(data.is_public);
      }
      if (data.connection_request_privacy !== undefined) {
        updateFields.push('connection_request_privacy = $' + (updateValues.length + 1));
        updateValues.push(data.connection_request_privacy);
      }

      if (updateFields.length > 0) {
        updateValues.push(tempUserId);
        await sql.unsafe(`
          UPDATE google_user_registration_temp_data 
          SET ${updateFields.join(', ')}, updated_at = NOW()
          WHERE user_id = $${updateValues.length}
        `, updateValues);
      }
    } else {
      // Create new temp data record
      await sql`
        INSERT INTO google_user_registration_temp_data (
          id, user_id, bio, interests, location, phone, description, 
          is_public, connection_request_privacy, created_at, updated_at
        )
        VALUES (
          ${uuidv4()}, ${tempUserId}, ${data.bio || null}, ${data.interests || null}, 
          ${data.location || null}, ${data.phone || null}, ${data.description || null},
          ${data.is_public || false}, ${data.connection_request_privacy || 'public'}, 
          NOW(), NOW()
        )
      `;
    }
  }

  // Get temporary registration data
  static async getTempRegistrationData(tempUserId: string): Promise<GoogleUserRegistrationTempData | null> {
    const data = await sql`
      SELECT * FROM google_user_registration_temp_data 
      WHERE user_id = ${tempUserId}
    `;
    return data.length > 0 ? data[0] as GoogleUserRegistrationTempData : null;
  }

  // Complete registration and move to main users table
  static async completeRegistration(tempUserId: string): Promise<User> {
    // Get temp user data
    const tempUser = await sql`
      SELECT * FROM google_users_temp WHERE id = ${tempUserId}
    `;
    
    if (tempUser.length === 0) {
      throw new Error('Temporary Google user not found');
    }

    // Get temp registration data
    const tempData = await this.getTempRegistrationData(tempUserId);
    const googleUser = tempUser[0] as GoogleUserTemp;

    // Create user in main users table
    const newUser = await sql`
      INSERT INTO users (
        id, name, email, password, google_id, is_google_user, description, 
        interests, avatar, isverified, isPublic, connection_request_privacy,
        account_status, created_at, updated_at
      )
      VALUES (
        ${uuidv4()}, ${googleUser.name}, ${googleUser.email}, null, ${googleUser.google_id}, 
        true, ${tempData?.description || null}, 
        ${tempData?.interests ? JSON.parse(tempData.interests) : []}, 
        ${googleUser.profile_pic || null}, true, 
        ${tempData?.is_public || false}, 
        ${tempData?.connection_request_privacy || 'public'},
        'active', NOW(), NOW()
      )
      RETURNING *
    `;

    // Clean up temporary data
    await this.cleanupTempData(tempUserId, googleUser.google_id);

    return newUser[0] as User;
  }

  // Clean up temporary data after successful registration
  static async cleanupTempData(tempUserId: string, googleId: string): Promise<void> {
    await sql`DELETE FROM google_user_registration_temp_data WHERE user_id = ${tempUserId}`;
    await sql`DELETE FROM google_user_registration_state WHERE user_id = ${tempUserId}`;
    await sql`DELETE FROM google_users_temp WHERE id = ${tempUserId} OR google_id = ${googleId}`;
  }

  // Check if registration is complete
  static async isRegistrationComplete(tempUserId: string): Promise<boolean> {
    const state = await sql`
      SELECT is_complete FROM google_user_registration_state 
      WHERE user_id = ${tempUserId}
    `;
    return state.length > 0 ? state[0].is_complete : false;
  }

  // Get registration progress
  static async getRegistrationProgress(tempUserId: string): Promise<{
    steps: GoogleRegistrationSteps;
    isComplete: boolean;
    completedCount: number;
    totalSteps: number;
  }> {
    const state = await this.getOrCreateRegistrationState(tempUserId);
    const steps = state.step_completed as GoogleRegistrationSteps;
    const completedCount = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;

    return {
      steps,
      isComplete: state.is_complete,
      completedCount,
      totalSteps
    };
  }
}