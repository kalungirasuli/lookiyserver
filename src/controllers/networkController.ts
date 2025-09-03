import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import sql from '../utils/db';
import { Network, NetworkMember, NetworkInvitation, NetworkGoal ,PendingNetworkJoin} from '../models/database';
import { generateAndUploadAvatar } from '../utils/avatar';
import { generateCustomQR } from '../utils/qrGenerator';
import { uploadToGCS } from '../utils/storage';
import logger from '../utils/logger';
import crypto from 'crypto';
import { cacheGet, cacheSet, cacheDelete, cacheInvalidatePattern } from '../utils/redis';
import { kafkaService, KafkaTopics } from '../utils/kafka';
import { getSocketService } from '../utils/socket';

// Helper function for real-time events
async function emitNetworkEvent(type: string, networkId: string, data: any, userId?: string) {
  await kafkaService.publishEvent(KafkaTopics.NETWORK_UPDATES, {
    type,
    networkId,
    userId,
    data
  });
}

interface CreateNetworkBody {
  title: string;
  type: 'public' | 'private';
  passcode?: string;
  description?: string;
  approvalMode: 'manual' | 'passcode' | 'auto';
}

interface UpdatePasscodeBody {
  newPasscode: string;
}

export async function createNetwork(
  req: AuthRequest,
  res: Response
) {
  console.log('Creating network', {request:req.body})
  const { title, type, passcode, description, approvalMode } = req.body as CreateNetworkBody;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!title || !type || !approvalMode) {
    return res.status(400).json({ message: 'Title, type and approval mode are required' });
  }

  // Validate passcode requirements for private networks
  if (type === 'private' && !passcode) {
    return res.status(400).json({ message: 'Passcode is required for private networks' });
  }
  if (type === 'public' && passcode) {
    return res.status(400).json({ message: 'Public networks cannot have passcodes' });
  }

  // Validate approval mode requirements
  if (approvalMode === 'passcode' && !passcode) {
    return res.status(400).json({ message: 'Passcode is required when using passcode approval mode' });
  }

  try {
    // Generate unique @tagname
    const baseTag = title.toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
      .substring(0, 20); // Limit length
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    // FIRST CHECK IF TAG NAME ALREADY EXISTS WITH OUT SUFFIX
    const existingNetworks = await sql<Network[]>`
      SELECT * FROM networks WHERE tag_name=${baseTag}
    `;
    //LOOP TO CHECK IT THE TAG NAME WITH OUT SUFFIX EXISTS IF EXIST THEN ADD SUFFIX AND CHECK UNTILL IS NOT EXIST
    let tagName = baseTag;
    if (existingNetworks.length > 0) {
      let suffixIndex = 1;
      while (existingNetworks.length > 0) {
        tagName = `${baseTag}${randomSuffix}`;
        const checkTag = await sql<Network[]>`
          SELECT * FROM networks WHERE tag_name=${tagName}
        `;
        if (checkTag.length === 0) {
          break;
        }
        suffixIndex++;
      }
    }

    // Create network and set creator as admin in a transaction
    const result = await sql.begin(async sql => {
      // Create network
      const networks = await sql<Network[]>`
        INSERT INTO networks (
          name, tag_name, description, is_private, passcode, approval_mode
        ) VALUES (
          ${title},
          ${tagName},
          ${description || null},
          ${type === 'private'},
          ${passcode || null},
          ${approvalMode}
        )
        RETURNING *
      `;

      const network = networks[0];

      // Set creator as admin
      await sql`
        INSERT INTO network_members (
          network_id, user_id, role
        ) VALUES (
          ${network.id}, ${userId}, 'admin'
        )
      `;

      // Generate and save network avatar
      try {
        const avatarUrl = await generateAndUploadAvatar(network.id);
        await sql`
          UPDATE networks
          SET avatar = ${avatarUrl}
          WHERE id = ${network.id}
        `;
        network.avatar = avatarUrl;
      } catch (avatarError) {
        logger.error('Failed to generate network avatar', {
          networkId: network.id,
          error: avatarError instanceof Error ? avatarError.message : 'Unknown error'
        });
        // Continue without avatar
      }

      // After successful creation, publish event
      await kafkaService.publishEvent(KafkaTopics.NETWORK_UPDATES, {
        type: 'created',
        networkId: network.id,
        userId: userId,
        data: network
      });

      return network;
    });

    // Cache the new network
    await cacheSet(`network:${result.id}`, result, 3600); // Cache for 1 hour

    logger.info('Network created successfully', {
      networkId: result.id,
      creatorId: userId,
      tagName: result.tag_name,
      approvalMode
    });

    res.status(201).json({
      message: 'Network created successfully',
      network: result
    });
  } catch (error) {
    logger.error('Network creation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      title,
      creatorId: userId
    });
    res.status(500).json({ message: 'Failed to create network' });
  }
}

export async function generateNetworkQR(req: Request, res: Response) {
  const { id } = req.params;

  try {
    // Get network info
    const networks = await sql<Network[]>`
      SELECT * FROM networks WHERE id = ${id}
    `;

    if (networks.length === 0) {
      return res.status(404).json({ message: 'Network not found' });
    }

    const network = networks[0];
    
    // Generate data for QR code
    const qrData = JSON.stringify({
      type: 'lookiy-network',
      id: network.id,
      tagName: network.tag_name,
      isPrivate: network.is_private
    });

    // Generate QR code with logo
    const qrBuffer = await generateCustomQR(qrData, 'default');

    // Send QR code
    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (error) {
    logger.error('QR code generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      networkId: id
    });
    res.status(500).json({ message: 'Failed to generate QR code' });
  }
}

export async function getShareableLink(req: Request, res: Response) {
  const { id } = req.params;

  try {
    // Get network info
    const networks = await sql<Network[]>`
      SELECT * FROM networks WHERE id = ${id}
    `;

    if (networks.length === 0) {
      return res.status(404).json({ message: 'Network not found' });
    }

    const network = networks[0];
    
    // Generate shareable link
    const shareableLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/join/${network.tag_name}`;

    res.json({ link: shareableLink });
  } catch (error) {
    logger.error('Failed to generate shareable link', {
      error: error instanceof Error ? error.message : 'Unknown error',
      networkId: id
    });
    res.status(500).json({ message: 'Failed to generate shareable link' });
  }
}

interface EditNetworkBody {
  name?: string;
  description?: string;
  passcode?: string;
  isPrivate?: boolean;
}

export async function editNetwork(
  req: AuthRequest,
  res: Response
) {
  const { id } = req.params;
  const userId = req.user?.id;
  const updates = req.body as EditNetworkBody;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Check if network exists and user is an admin
    const members = await sql<NetworkMember[]>`
      SELECT nm.*, n.is_private 
      FROM network_members nm
      JOIN networks n ON n.id = nm.network_id
      WHERE nm.network_id = ${id}
        AND nm.user_id = ${userId}
        AND nm.role = 'admin'
    `;

    if (members.length === 0) {
      return res.status(403).json({ message: 'Only network admins can edit network details' });
    }

    // Get current network state
    const networks = await sql<Network[]>`
      SELECT * FROM networks WHERE id = ${id}
    `;
    const network = networks[0];

    // Handle file upload if present
    let avatarUrl: string | undefined;
    if (req.file) {
      try {
        avatarUrl = await uploadToGCS(req.file);
      } catch (error) {
        logger.error('Network avatar upload failed', {
          networkId: id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        return res.status(500).json({ message: 'Failed to upload network avatar' });
      }
    }

    // Build update query
    const updateFields = [];
    if (updates.name !== undefined) {
      updateFields.push(sql`name = ${updates.name}`);
    }
    if (updates.description !== undefined) {
      updateFields.push(sql`description = ${updates.description}`);
    }

    // Handle privacy changes
    if (updates.isPrivate !== undefined) {
      // If switching to private, require a passcode
      if (updates.isPrivate && !updates.passcode && !network.passcode) {
        return res.status(400).json({ 
          message: 'A passcode is required when making a network private' 
        });
      }
      updateFields.push(sql`is_private = ${updates.isPrivate}`);
      
      // Clear passcode if switching to public
      if (!updates.isPrivate) {
        updateFields.push(sql`passcode = NULL`);
      }
    }

    // Update passcode only if provided and network is/will be private
    if (updates.passcode !== undefined) {
      const willBePrivate = updates.isPrivate ?? network.is_private;
      if (!willBePrivate) {
        return res.status(400).json({ 
          message: 'Cannot set passcode for public networks' 
        });
      }
      updateFields.push(sql`passcode = ${updates.passcode}`);
    }

    if (avatarUrl) {
      updateFields.push(sql`avatar = ${avatarUrl}`);
    }
    updateFields.push(sql`updated_at = NOW()`);

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Combine all updates with commas
    const updateClause = updateFields.reduce((acc, curr) => sql`${acc}, ${curr}`);

    // Execute update
    const result = await sql<Network[]>`
      UPDATE networks
      SET ${updateClause}
      WHERE id = ${id}
      RETURNING *
    `;

    // Invalidate relevant caches
    await cacheInvalidatePattern(`network:${id}:*`);

    logger.info('Network updated successfully', {
      networkId: id,
      updatedBy: userId,
      updatedFields: Object.keys(updates),
      privacyChanged: updates.isPrivate !== undefined
    });

    // Emit real-time update
    await emitNetworkEvent('updated', id, result[0], userId);

    res.json({
      message: 'Network updated successfully',
      network: result[0]
    });
  } catch (error) {
    logger.error('Network update failed', {
      networkId: id,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to update network' });
  }
}

interface AssignRoleBody {
  role: 'leader' | 'vip' | 'moderator' | 'member';
}

export async function assignRole(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId, userId: targetUserId } = req.params;
  const { role } = req.body as AssignRoleBody;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Validate role
  const allowedRoles = ['leader', 'vip', 'moderator', 'member'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ 
      message: 'Invalid role. Must be one of: leader, vip, moderator, member' 
    });
  }

  try {
    // Verify admin permission
    const admins = await sql<NetworkMember[]>`
      SELECT * FROM network_members 
      WHERE network_id = ${networkId}
        AND user_id = ${adminId}
        AND role = 'admin'
    `;

    if (admins.length === 0) {
      return res.status(403).json({ message: 'Only network admins can assign roles' });
    }

    // Verify target user is a member of the network
    const members = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${targetUserId}
    `;

    if (members.length === 0) {
      return res.status(404).json({ message: 'User is not a member of this network' });
    }

    // Prevent modifying another admin's role
    if (members[0].role === 'admin') {
      return res.status(403).json({ message: 'Cannot modify admin roles' });
    }

    // Update the role
    const result = await sql<NetworkMember[]>`
      UPDATE network_members
      SET role = ${role}
      WHERE network_id = ${networkId}
        AND user_id = ${targetUserId}
      RETURNING *
    `;

    // Invalidate relevant caches
    await cacheInvalidatePattern(`network:${networkId}:*`);

    // Publish role change event
    await kafkaService.publishEvent(KafkaTopics.NETWORK_UPDATES, {
      type: 'role_changed',
      networkId,
      userId: targetUserId,
      data: { role, updatedBy: adminId }
    });

    // Send notification to affected user
    await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
      type: 'role_update',
      userId: targetUserId,
      title: 'Role Updated',
      message: `Your role in the network has been updated to ${role}`,
      data: { networkId, role }
    });

    logger.info('Network role updated', {
      networkId,
      userId: targetUserId,
      newRole: role,
      updatedBy: adminId
    });

    // Emit real-time update
    await emitNetworkEvent('role_changed', networkId, { 
      userId: targetUserId, 
      role: role,
      updatedBy: adminId 
    }, targetUserId);

    res.json({
      message: 'Role updated successfully',
      member: result[0]
    });
  } catch (error) {
    logger.error('Role assignment failed', {
      networkId,
      userId: targetUserId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to assign role' });
  }
}

// Helper function to check if user has sufficient permissions
async function hasPermission(networkId: string, userId: string, requiredRoles: string[]): Promise<boolean> {
  const members = await sql<NetworkMember[]>`
    SELECT * FROM network_members
    WHERE network_id = ${networkId}
      AND user_id = ${userId}
      AND role = ANY(${requiredRoles})
  `;
  return members.length > 0;
}

export async function removeMember(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId, userId: memberToRemove } = req.params;
  const removerId = req.user?.id;

  if (!removerId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Check if remover has permission (admin or moderator)
    const hasAuth = await hasPermission(networkId, removerId, ['admin', 'moderator']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only admins and moderators can remove members' });
    }

    // Get member's current role
    const members = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${memberToRemove}
    `;

    if (members.length === 0) {
      return res.status(404).json({ message: 'Member not found' });
    }

    const memberRole = members[0].role;
    const removerRole = (await sql<NetworkMember[]>`
      SELECT role FROM network_members
      WHERE network_id = ${networkId} AND user_id = ${removerId}
    `)[0].role;

    // Only admins can remove moderators/leaders/VIPs
    if (['moderator', 'leader', 'vip'].includes(memberRole) && removerRole !== 'admin') {
      return res.status(403).json({ 
        message: 'Only admins can remove moderators, leaders, or VIPs' 
      });
    }

    // Cannot remove admins
    if (memberRole === 'admin') {
      return res.status(403).json({ message: 'Cannot remove network admins' });
    }

    // Remove the member
    await sql`
      DELETE FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${memberToRemove}
    `;

    logger.info('Network member removed', {
      networkId,
      removedUserId: memberToRemove,
      removedByUserId: removerId,
      memberRole
    });

    // After successful removal, emit activity
    await emitNetworkActivity(networkId, {
      type: 'member_removed',
      userId: memberToRemove,
      data: { removedBy: removerId, role: memberRole }
    });

    // Emit real-time update
    await emitNetworkEvent('member_removed', networkId, { 
      userId: memberToRemove,
      removedBy: removerId 
    }, memberToRemove);

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    logger.error('Failed to remove network member', {
      networkId,
      memberToRemove,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to remove member' });
  }
}

interface ApproveMemberBody {
  userId: string;
}

export async function approveMember(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const { userId: newMemberId } = req.body as ApproveMemberBody;
  const approverId = req.user?.id;

  if (!approverId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Check if approver has permission (admin, moderator)
    const hasAuth = await hasPermission(networkId, approverId, ['admin', 'moderator']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only admins and moderators can approve new members' });
    }

    // Add the new member
    const result = await sql<NetworkMember[]>`
      INSERT INTO network_members (
        network_id, user_id, role
      ) VALUES (
        ${networkId}, ${newMemberId}, 'member'
      )
      RETURNING *
    `;

    // Invalidate relevant caches
    await cacheInvalidatePattern(`network:${networkId}:*`);

    logger.info('New network member approved', {
      networkId,
      newMemberId,
      approvedByUserId: approverId
    });

    // Notify the new member
    await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
      type: 'welcome',
      userId: newMemberId,
      title: 'Welcome to the Network',
      message: 'You have been approved to join the network.',
      data: { networkId }
    });

    // Emit real-time update
    await emitNetworkEvent('member_joined', networkId, { 
      userId: newMemberId,
      role: 'member',
      approvedBy: approverId 
    }, newMemberId);

    res.status(201).json({
      message: 'New member approved successfully',
      member: result[0]
    });
  } catch (error) {
    logger.error('Failed to approve new member', {
      networkId,
      newMemberId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to approve new member' });
  }
}

export async function promoteToAdmin(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId, userId: targetUserId } = req.params;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Check if promoter is an admin
    const isAdmin = await hasPermission(networkId, adminId, ['admin']);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admins can promote members to admin' });
    }

    // Check if target user is a member
    const members = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${targetUserId}
    `;

    if (members.length === 0) {
      return res.status(404).json({ message: 'User is not a member of this network' });
    }

    // Promote to admin
    const result = await sql<NetworkMember[]>`
      UPDATE network_members
      SET role = 'admin'
      WHERE network_id = ${networkId}
        AND user_id = ${targetUserId}
      RETURNING *
    `;

    // Invalidate relevant caches
    await cacheInvalidatePattern(`network:${networkId}:*`);

    logger.info('Member promoted to admin', {
      networkId,
      userId: targetUserId,
      promotedBy: adminId
    });

    // Notify the promoted member
    await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
      type: 'role_update',
      userId: targetUserId,
      title: 'Congratulations!',
      message: 'You have been promoted to admin in the network.',
      data: { networkId, role: 'admin' }
    });

    // After successful promotion, emit activity
    await emitNetworkActivity(networkId, {
      type: 'role_changed',
      userId: targetUserId,
      data: { role: 'admin', updatedBy: adminId }
    });

    // Emit real-time update
    await emitNetworkEvent('role_changed', networkId, { 
      userId: targetUserId, 
      role: 'admin',
      updatedBy: adminId 
    }, targetUserId);

    res.json({
      message: 'Member promoted to admin successfully',
      member: result[0]
    });
  } catch (error) {
    logger.error('Failed to promote member to admin', {
      networkId,
      targetUserId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to promote member to admin' });
  }
}

export async function resignAdmin(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Check if user is an admin
    const isAdmin = await hasPermission(networkId, userId, ['admin']);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admins can resign from admin role' });
    }

    // Count remaining admins
    const adminCount = await sql<{ count: number }[]>`
      SELECT COUNT(*) as count
      FROM network_members
      WHERE network_id = ${networkId}
        AND role = 'admin'
    `;

    if (adminCount[0].count <= 1) {
      return res.status(400).json({ 
        message: 'Cannot resign as admin: network must have at least one admin' 
      });
    }

    // Resign from admin role
    const result = await sql<NetworkMember[]>`
      UPDATE network_members
      SET role = 'member'
      WHERE network_id = ${networkId}
        AND user_id = ${userId}
      RETURNING *
    `;

    // Invalidate relevant caches
    await cacheInvalidatePattern(`network:${networkId}:*`);

    logger.info('Admin resigned', {
      networkId,
      userId
    });

    // Notify the resigned admin
    await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
      type: 'role_update',
      userId: userId,
      title: 'Role Update',
      message: 'You have resigned from the admin role.',
      data: { networkId, role: 'member' }
    });

    // Emit real-time update
    await emitNetworkEvent('role_changed', networkId, { 
      userId: userId, 
      role: 'member',
      updatedBy: userId 
    }, userId);

    res.json({
      message: 'Resigned from admin role successfully',
      member: result[0]
    });
  } catch (error) {
    logger.error('Failed to resign from admin role', {
      networkId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to resign from admin role' });
  }
}

interface JoinRequestBody {
  passcode?: string;
}

export async function requestJoin(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const { passcode } = (req.body as JoinRequestBody) || {};
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Get network details
    const networks = await sql<Network[]>`
      SELECT * FROM networks WHERE id = ${networkId}
    `;

    if (networks.length === 0) {
      return res.status(404).json({ message: 'Network not found' });
    }

    const network = networks[0];

    // Check if user is already a member
    const existingMember = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId} AND user_id = ${userId}
    `;

    if (existingMember.length > 0) {
      return res.status(400).json({ message: 'Already a member of this network' });
    }

    // Check if there's a pending request
    const pendingRequest = await sql<PendingNetworkJoin[]>`
      SELECT * FROM pending_network_joins
      WHERE network_id = ${networkId}
        AND user_id = ${userId}
        AND status = 'pending'
    `;

    if (pendingRequest.length > 0) {
      return res.status(400).json({ 
        message: 'Join request already pending. Please wait for approval.',
        requestId: pendingRequest[0].id
      });
    }

    // Handle different approval modes
    switch (network.approval_mode) {
      case 'auto':
        await sql`
          INSERT INTO network_members (network_id, user_id, role)
          VALUES (${networkId}, ${userId}, 'member')
        `;
        // Publish member joined event
        await kafkaService.publishEvent(KafkaTopics.NETWORK_UPDATES, {
          type: 'member_joined',
          networkId,
          userId,
          data: { role: 'member' }
        });

        // Invalidate member cache
        await cacheInvalidatePattern(`network:${networkId}:*`);

        return res.status(201).json({ message: 'Joined network successfully' });

      case 'passcode':
        if (!passcode) {
          return res.status(400).json({ message: 'Passcode required to join this network' });
        }
        if (passcode !== network.passcode) {
          // Store failed attempt
          await sql`
            INSERT INTO pending_network_joins (
              network_id, user_id, status, passcode_attempt
            ) VALUES (
              ${networkId}, ${userId}, 'rejected', ${passcode}
            )
          `;
          return res.status(403).json({ message: 'Invalid passcode' });
        }
        // Correct passcode
        await sql`
          INSERT INTO network_members (network_id, user_id, role)
          VALUES (${networkId}, ${userId}, 'member')
        `;
        // Publish member joined event
        await kafkaService.publishEvent(KafkaTopics.NETWORK_UPDATES, {
          type: 'member_joined',
          networkId,
          userId,
          data: { role: 'member' }
        });

        // Invalidate member cache
        await cacheInvalidatePattern(`network:${networkId}:*`);

        return res.status(201).json({ message: 'Joined network successfully' });

      case 'manual':
        // Create pending join request
        const request = await sql<PendingNetworkJoin[]>`
          INSERT INTO pending_network_joins (
            network_id, user_id, status
          ) VALUES (
            ${networkId}, ${userId}, 'pending'
          )
          RETURNING *
        `;

        // Publish join request event
        await kafkaService.publishEvent(KafkaTopics.JOIN_REQUESTS, {
          type: 'created',
          networkId,
          userId,
          requestId: request[0].id,
          data: request[0]
        });

        // Notify admins via socket
        getSocketService().emitToNetworkAdmins(networkId, 'join:request', {
          networkId,
          userId,
          requestId: request[0].id
        });

        return res.status(202).json({ 
          message: 'Join request submitted. Waiting for admin/moderator approval.',
          requestId: request[0].id
        });

      default:
        return res.status(500).json({ message: 'Invalid network configuration' });
    }
  } catch (error) {
    logger.error('Failed to process join request', {
      networkId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to process join request' });
  }
}

export async function handleJoinRequest(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId, requestId } = req.params;
  const { action } = req.body as { action: 'approve' | 'reject' };
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ message: 'Invalid action' });
  }

  try {
    // Verify admin permission
    const hasAuth = await hasPermission(networkId, adminId, ['admin', 'moderator']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only admins and moderators can handle join requests' });
    }

    // Get the join request
    const requests = await sql`
      SELECT * FROM pending_network_joins
      WHERE id = ${requestId}
        AND network_id = ${networkId}
        AND status = 'pending'
    `;

    if (requests.length === 0) {
      return res.status(404).json({ message: 'Join request not found or already processed' });
    }

    const request = requests[0];

    const updatedRequest = await sql.begin(async sql => {
      if (action === 'approve') {
        // Add as member and update request status
        await sql`
          INSERT INTO network_members (network_id, user_id, role)
          VALUES (${networkId}, ${request.user_id}, 'member')
        `;

        await sql`
          UPDATE pending_network_joins
          SET status = 'approved'
          WHERE id = ${requestId}
        `;

        // Publish member joined event
        await kafkaService.publishEvent(KafkaTopics.NETWORK_UPDATES, {
          type: 'member_joined',
          networkId,
          userId: request.user_id,
          data: { role: 'member' }
        });

        // Invalidate member cache
        await cacheInvalidatePattern(`network:${networkId}:*`);
      } else {
        // Reject request
        await sql`
          UPDATE pending_network_joins
          SET status = 'rejected'
          WHERE id = ${requestId}
        `;
      }

      // Publish event based on action
      await kafkaService.publishEvent(KafkaTopics.JOIN_REQUESTS, {
        type: action,
        networkId,
        userId: request.user_id,
        requestId,
        data: { approvedBy: adminId }
      });

      return request;
    });

    // Send notification to user
    await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
      type: 'join_request_' + action,
      userId: request.user_id,
      title: `Join Request ${action === 'approve' ? 'Approved' : 'Rejected'}`,
      message: `Your request to join the network has been ${action === 'approve' ? 'approved' : 'rejected'}`,
      data: { networkId }
    });

    res.json({ message: `Join request ${action}ed` });
  } catch (error) {
    logger.error('Failed to handle join request', {
      networkId,
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to handle join request' });
  }
}

interface CreateInvitationsBody {
  userIds: string[];
  role: 'admin' | 'leader' | 'vip' | 'moderator' | 'member';
  expiresIn?: number; // hours
}

export async function createInvitations(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const { userIds, role, expiresIn = 48 } = req.body as CreateInvitationsBody;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!userIds?.length || !role) {
    return res.status(400).json({ message: 'User IDs and role are required' });
  }

  try {
    // Verify admin permission
    const hasAuth = await hasPermission(networkId, adminId, ['admin']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only network admins can create invitations' });
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresIn);

    // Create invitations in a transaction
    const invitations = await sql.begin(async sql => {
      const results: NetworkInvitation[] = [];
      for (const userId of userIds) {
        // Check if user already has an active invitation
        const existing = await sql<NetworkInvitation[]>`
          SELECT * FROM network_invitations
          WHERE network_id = ${networkId}
            AND invited_user_id = ${userId}
            AND is_used = false
            AND expires_at > NOW()
        `;

        if (existing.length === 0) {
          const inviteToken = crypto.randomUUID();
          const [invite] = await sql<NetworkInvitation[]>`
            INSERT INTO network_invitations (
              network_id, invited_user_id, invited_by_id,
              role, invite_token, expires_at
            ) VALUES (
              ${networkId}, ${userId}, ${adminId},
              ${role}, ${inviteToken}, ${expiresAt}
            )
            RETURNING *
          `;
          results.push(invite);
          
          // Send real-time notification to invited user
          await kafkaService.publishEvent(KafkaTopics.NOTIFICATIONS, {
            type: 'network_invitation',
            userId,
            title: 'Network Invitation',
            message: `You have been invited to join a network`,
            data: {
              networkId,
              invitedBy: adminId,
              role,
              expiresAt
            }
          });
        }
      }
      return results;
    });

    // Emit activity for network members
    await emitNetworkActivity(networkId, {
      type: 'invitations_created',
      userId: adminId,
      data: {
        count: invitations.length,
        roles: invitations.map(i => i.role)
      }
    });

    logger.info('Network invitations created', {
      networkId,
      invitedCount: invitations.length,
      createdBy: adminId
    });

    res.status(201).json({
      message: 'Invitations created successfully',
      invitations
    });
  } catch (error) {
    logger.error('Failed to create invitations', {
      networkId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to create invitations' });
  }
}

interface JoinNetworkBody {
  inviteToken?: string;
  passcode?: string;
}

export async function joinNetwork(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const { inviteToken, passcode } = req.body || {};
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  // Validate UUID formats
  if (!isValidUUID(networkId)) {
    logger.error('Invalid network ID format', { networkId });
    return res.status(400).json({ message: 'Invalid network ID format' });
  }

  if (!isValidUUID(userId)) {
    logger.error('Invalid user ID format', { userId });
    return res.status(400).json({ message: 'Invalid user ID format' });
  }

  if (inviteToken && !isValidUUID(inviteToken)) {
    logger.error('Invalid invite token format', { inviteToken });
    return res.status(400).json({ message: 'Invalid invite token format' });
  }

  try {
    // Check if already a member
    const existingMember = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${userId}
    `;

    if (existingMember.length > 0) {
      return res.status(400).json({ message: 'Already a member of this network' });
    }

    // Get network details
    const networks = await sql<Network[]>`
      SELECT * FROM networks WHERE id = ${networkId}
    `;

    if (networks.length === 0) {
      return res.status(404).json({ message: 'Network not found' });
    }

    const network = networks[0];

    // First, check for invitation as it bypasses all other restrictions
    if (inviteToken) {
      const invitations = await sql<NetworkInvitation[]>`
        SELECT * FROM network_invitations
        WHERE network_id = ${networkId}
          AND invited_user_id = ${userId}
          AND invite_token = ${inviteToken}
          AND is_used = false
          AND expires_at > NOW()
      `;

      if (invitations.length > 0) {
        const invitation = invitations[0];

        // Add user with invited role and mark invitation as used
        await sql.begin(async sql => {
          await sql`
            INSERT INTO network_members (
              network_id, user_id, role
            ) VALUES (
              ${networkId}, ${userId}, ${invitation.role}
            )
          `;

          await sql`
            UPDATE network_invitations
            SET is_used = true
            WHERE id = ${invitation.id}
          `;
        });

        logger.info('User joined network via invitation', {
          networkId,
          userId,
          invitedRole: invitation.role
        });

        return res.status(201).json({ 
          message: 'Successfully joined network via invitation',
          role: invitation.role
        });
      }
    }

    // If no valid invitation, proceed with normal join process
    if (network.is_private) {
      if (!passcode) {
        return res.status(400).json({ message: 'Passcode required for private networks' });
      }
      if (passcode !== network.passcode) {
        return res.status(403).json({ message: 'Invalid passcode' });
      }
    }

    // Check for existing invitation without token (for automatic approval)
    const activeInvitation = await sql<NetworkInvitation[]>`
      SELECT * FROM network_invitations
      WHERE network_id = ${networkId}
        AND invited_user_id = ${userId}
        AND is_used = false
        AND expires_at > NOW()
      LIMIT 1
    `;

    // If user has an active invitation, use that role, otherwise use 'member'
    const role = activeInvitation.length > 0 ? activeInvitation[0].role : 'member';

    // Add user as member
    await sql.begin(async sql => {
      await sql`
        INSERT INTO network_members (
          network_id, user_id, role
        ) VALUES (
          ${networkId}, ${userId}, ${role}
        )
      `;

      // If joining with an existing invitation, mark it as used
      if (activeInvitation.length > 0) {
        await sql`
          UPDATE network_invitations
          SET is_used = true
          WHERE id = ${activeInvitation[0].id}
        `;
      }
    });

    logger.info('User joined network', {
      networkId,
      userId,
      role,
      hadInvitation: activeInvitation.length > 0
    });

    res.status(201).json({ 
      message: 'Successfully joined network',
      role
    });
  } catch (error) {
    logger.error('Failed to join network', {
      networkId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to join network' });
  }
}

interface CreateGoalBody {
  title: string;
  description?: string;
}

export async function createNetworkGoal(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const { title, description } = req.body as CreateGoalBody;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!title) {
    return res.status(400).json({ message: 'Goal title is required' });
  }

  try {
    // Verify admin permission
    const hasAuth = await hasPermission(networkId, adminId, ['admin']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only network admins can create goals' });
    }

    const goal = await sql<NetworkGoal[]>`
      INSERT INTO network_goals (
        network_id, title, description, created_by_id
      ) VALUES (
        ${networkId}, ${title}, ${description || null}, ${adminId}
      )
      RETURNING *
    `;

    logger.info('Network goal created', {
      networkId,
      goalId: goal[0].id,
      createdBy: adminId
    });

    // After successful goal creation, emit activity
    await emitNetworkActivity(networkId, {
      type: 'goal_created',
      userId: adminId,
      data: goal[0]
    });

    // Emit real-time update
    await emitNetworkEvent('goal_created', networkId, {
      goalId: goal[0].id,
      createdBy: adminId,
      goalData: goal[0]
    }, adminId);

    res.status(201).json({
      message: 'Goal created successfully',
      goal: goal[0]
    });
  } catch (error) {
    logger.error('Failed to create network goal', {
      networkId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to create network goal' });
  }
}

export async function getNetworkGoals(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Check if user is a member
    const isMember = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${userId}
    `;

    if (isMember.length === 0) {
      return res.status(403).json({ message: 'Only network members can view goals' });
    }

    const goals = await sql<NetworkGoal[]>`
      SELECT * FROM network_goals
      WHERE network_id = ${networkId}
      ORDER BY created_at DESC
    `;

    res.json({ goals });
  } catch (error) {
    logger.error('Failed to fetch network goals', {
      networkId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to fetch network goals' });
  }
}

interface UpdateGoalBody {
  title?: string;
  description?: string;
}

export async function updateNetworkGoal(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId, goalId } = req.params;
  const updates = req.body as UpdateGoalBody;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Verify admin permission
    const hasAuth = await hasPermission(networkId, adminId, ['admin']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only network admins can update goals' });
    }

    const updateFields = [];
    if (updates.title !== undefined) {
      updateFields.push(sql`title = ${updates.title}`);
    }
    if (updates.description !== undefined) {
      updateFields.push(sql`description = ${updates.description}`);
    }
    updateFields.push(sql`updated_at = NOW()`);

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    const updateClause = updateFields.reduce((acc, curr) => sql`${acc}, ${curr}`);

    const goals = await sql<NetworkGoal[]>`
      UPDATE network_goals
      SET ${updateClause}
      WHERE id = ${goalId}
        AND network_id = ${networkId}
      RETURNING *
    `;

    if (goals.length === 0) {
      return res.status(404).json({ message: 'Goal not found' });
    }

    // Emit goal update activity
    await emitNetworkActivity(networkId, {
      type: 'goal_updated',
      userId: adminId,
      data: {
        goalId,
        updates,
        goal: goals[0]
      }
    });

    // Also notify users who selected this goal
    const usersWithGoal = await sql`
      SELECT DISTINCT user_id
      FROM user_network_goals
      WHERE network_id = ${networkId}
        AND goal_id = ${goalId}
    `;

    for (const { user_id } of usersWithGoal) {
      getSocketService().emitToUser(user_id, 'goal:update', {
        networkId,
        goalId,
        goal: goals[0]
      });
    }

    logger.info('Network goal updated', {
      networkId,
      goalId,
      updatedBy: adminId
    });

    // Emit real-time update
    await emitNetworkEvent('goal_updated', networkId, {
      goalId,
      updatedBy: adminId,
      changes: updates
    }, adminId);

    res.json({
      message: 'Goal updated successfully',
      goal: goals[0]
    });
  } catch (error) {
    logger.error('Failed to update network goal', {
      networkId,
      goalId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to update network goal' });
  }
}

export async function deleteNetworkGoal(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId, goalId } = req.params;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Verify admin permission
    const hasAuth = await hasPermission(networkId, adminId, ['admin']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only network admins can delete goals' });
    }

    // Get users who selected this goal before deletion
    const usersWithGoal = await sql`
      SELECT DISTINCT user_id
      FROM user_network_goals
      WHERE network_id = ${networkId}
        AND goal_id = ${goalId}
    `;

    await sql.begin(async sql => {
      // Delete goal selections first
      await sql`
        DELETE FROM user_network_goals
        WHERE goal_id = ${goalId}
          AND network_id = ${networkId}
      `;

      // Then delete the goal
      await sql`
        DELETE FROM network_goals
        WHERE id = ${goalId}
          AND network_id = ${networkId}
      `;
    });

    // Emit goal deletion activity
    await emitNetworkActivity(networkId, {
      type: 'goal_deleted',
      userId: adminId,
      data: { goalId }
    });

    // Notify users who had this goal selected
    for (const { user_id } of usersWithGoal) {
      getSocketService().emitToUser(user_id, 'goal:deleted', {
        networkId,
        goalId
      });
    }

    logger.info('Network goal deleted', {
      networkId,
      goalId,
      deletedBy: adminId,
      affectedUsers: usersWithGoal.length
    });

    // Emit real-time update
    await emitNetworkEvent('goal_deleted', networkId, {
      goalId,
      deletedBy: adminId
    }, adminId);

    res.json({ message: 'Goal deleted successfully' });
  } catch (error) {
    logger.error('Failed to delete network goal', {
      networkId,
      goalId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to delete network goal' });
  }
}

interface SelectGoalsBody {
  goalIds: string[];
}

export async function selectNetworkGoals(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const { goalIds } = req.body as SelectGoalsBody;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!goalIds?.length) {
    return res.status(400).json({ message: 'At least one goal must be selected' });
  }

  try {
    // Check if user is a member
    const isMember = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${userId}
    `;

    if (isMember.length === 0) {
      return res.status(403).json({ message: 'Must be a network member to select goals' });
    }

    // Verify goals exist and belong to this network
    const validGoals = await sql<NetworkGoal[]>`
      SELECT id FROM network_goals
      WHERE id = ANY(${goalIds})
        AND network_id = ${networkId}
    `;

    if (validGoals.length !== goalIds.length) {
      return res.status(400).json({ message: 'One or more invalid goals selected' });
    }

    // Delete existing selections and insert new ones
    await sql.begin(async sql => {
      await sql`
        DELETE FROM user_network_goals
        WHERE user_id = ${userId}
          AND network_id = ${networkId}
      `;

      for (const goalId of goalIds) {
        await sql`
          INSERT INTO user_network_goals (
            user_id, network_id, goal_id
          ) VALUES (
            ${userId}, ${networkId}, ${goalId}
          )
        `;
      }
    });

    // Emit goal selection activity
    await emitNetworkActivity(networkId, {
      type: 'goals_selected',
      userId,
      data: {
        goalIds,
        timestamp: new Date()
      }
    });

    // Notify network admins
    getSocketService().emitToNetworkAdmins(networkId, 'member:goals', {
      userId,
      goalIds,
      type: 'selected'
    });

    logger.info('User network goals updated', {
      networkId,
      userId,
      goalCount: goalIds.length
    });

    res.json({ message: 'Goals selected successfully' });
  } catch (error) {
    logger.error('Failed to select network goals', {
      networkId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to select network goals' });
  }
}

export async function getNetworkMembers(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Try to get from cache first
    const cachedMembers = await cacheGet(`network:${networkId}:members`);
    if (cachedMembers) {
      return res.json({ members: cachedMembers });
    }

    // Check if user is a member
    const isMember = await sql<NetworkMember[]>`
      SELECT * FROM network_members
      WHERE network_id = ${networkId}
        AND user_id = ${userId}
    `;

    if (isMember.length === 0) {
      return res.status(403).json({ message: 'Must be a network member to view other members' });
    }

    // Get members with their roles and selected goals
    const members = await sql`
      SELECT 
        u.id,
        u.name,
        u.email,
        u.avatar,
        nm.role,
        nm.joined_at,
        json_agg(
          json_build_object(
            'id', ng.id,
            'title', ng.title,
            'description', ng.description
          )
        ) FILTER (WHERE ng.id IS NOT NULL) as goals
      FROM network_members nm
      JOIN users u ON u.id = nm.user_id
      LEFT JOIN user_network_goals ung ON ung.user_id = nm.user_id 
        AND ung.network_id = nm.network_id
      LEFT JOIN network_goals ng ON ng.id = ung.goal_id
      WHERE nm.network_id = ${networkId}
      GROUP BY u.id, u.name, u.email, u.avatar, nm.role, nm.joined_at
      ORDER BY nm.role != 'admin', nm.role != 'moderator', nm.joined_at DESC
    `;

    // Cache the results
    await cacheSet(`network:${networkId}:members`, members, 300); // Cache for 5 minutes

    res.json({ members });
  } catch (error) {
    logger.error('Failed to fetch network members', {
      networkId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to fetch network members' });
  }
}

// UUID validation function
function isValidUUID(uuid: string) {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(uuid);
}

export async function updateNetworkPasscode(
  req: AuthRequest,
  res: Response
) {
  const { id: networkId } = req.params;
  const { newPasscode } = req.body as UpdatePasscodeBody;
  const adminId = req.user?.id;

  if (!adminId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  try {
    // Verify admin permission
    const hasAuth = await hasPermission(networkId, adminId, ['admin']);
    if (!hasAuth) {
      return res.status(403).json({ message: 'Only network admins can update passcode' });
    }

    // Get network details
    const networks = await sql<Network[]>`
      SELECT * FROM networks WHERE id = ${networkId}
    `;

    if (networks.length === 0) {
      return res.status(404).json({ message: 'Network not found' });
    }

    const network = networks[0];

    // Only allow passcode updates for private networks or those with passcode approval mode
    if (!network.is_private && network.approval_mode !== 'passcode') {
      return res.status(400).json({ 
        message: 'Passcode can only be set for private networks or networks with passcode approval' 
      });
    }

    // Update passcode
    const result = await sql<Network[]>`
      UPDATE networks
      SET passcode = ${newPasscode},
          last_passcode_update = NOW()
      WHERE id = ${networkId}
      RETURNING *
    `;

    logger.info('Network passcode updated', {
      networkId,
      updatedBy: adminId
    });

    // Emit real-time update
    await emitNetworkEvent('passcode_updated', networkId, { updatedBy: adminId }, adminId);

    res.json({
      message: 'Network passcode updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update network passcode', {
      networkId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).json({ message: 'Failed to update network passcode' });
  }
}

// Add activity streaming for network events
async function emitNetworkActivity(networkId: string, activity: {
  type: string;
  userId?: string;
  data?: any;
}) {
  // Emit to all network members
  getSocketService().emitToNetwork(networkId, 'network:activity', activity);

  // Cache recent activity
  const cacheKey = `network:${networkId}:activity`;
  const recentActivity = await cacheGet<any[]>(cacheKey) || [];
  recentActivity.unshift({ ...activity, timestamp: new Date() });
  
  // Keep last 50 activities
  if (recentActivity.length > 50) {
    recentActivity.pop();
  }
  
  await cacheSet(cacheKey, recentActivity, 24 * 60 * 60); // Cache for 24 hours
}

export async function suspendNetwork(
  req: AuthRequest,
  res: Response
) {
  try {
    const { id: networkId } = req.params;
    const userId = req.user!.id;

    if (!isValidUUID(networkId)) {
      return res.status(400).json({ error: 'Invalid network ID format' });
    }

    // Check if network exists
    const network = await sql<Network[]>`
      SELECT * FROM networks WHERE id = ${networkId}
    `;

    if (network.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }

    // Check if network is already suspended
    if (network[0].suspension_status !== 'active') {
      return res.status(400).json({ error: 'Network is already suspended' });
    }

    // Check if user is creator or admin
    const member = await sql<NetworkMember[]>`
      SELECT role FROM network_members 
      WHERE network_id = ${networkId} AND user_id = ${userId}
    `;

    if (member.length === 0 || !['creator', 'admin'].includes(member[0].role)) {
      return res.status(403).json({ error: 'Only network creators and admins can suspend networks' });
    }

    // Generate suspension token for reclaim
    const suspensionToken = crypto.randomUUID();
    const suspensionExpiresAt = new Date();
    suspensionExpiresAt.setDate(suspensionExpiresAt.getDate() + 28); // 28 days from now

    // Update network to suspended status
    await sql`
      UPDATE networks 
      SET 
        suspension_status = 'temporarily_suspended',
        suspended_at = CURRENT_TIMESTAMP,
        suspended_by = ${userId},
        suspension_token = ${suspensionToken},
        suspension_expires_at = ${suspensionExpiresAt},
        name = CASE 
          WHEN name NOT LIKE '%(suspended)' THEN name || ' (suspended)'
          ELSE name
        END
      WHERE id = ${networkId}
    `;

    // Clear caches
    await cacheInvalidatePattern(`network:${networkId}:*`);
    await cacheInvalidatePattern(`user:*:networks`);
    await cacheInvalidatePattern(`recommendations:*:${networkId}`);

    // Emit network suspension event
    await emitNetworkEvent('network_suspended', networkId, {
      suspendedBy: userId,
      suspendedAt: new Date(),
      suspensionToken,
      suspensionExpiresAt
    });

    // Log network suspension
    logger.info('Network suspended', {
      networkId,
      suspendedBy: userId,
      networkName: network[0].name,
      suspensionExpiresAt
    });

    res.json({ 
      message: 'Network suspended successfully',
      suspensionToken,
      expiresAt: suspensionExpiresAt
    });
  } catch (error) {
    logger.error('Error suspending network:', error);
    res.status(500).json({ error: 'Failed to suspend network' });
  }
}

export async function unsuspendNetwork(
  req: AuthRequest,
  res: Response
) {
  try {
    const { networkId } = req.params;
    const { suspensionToken } = req.body;
    const userId = req.user!.id;

    if (!isValidUUID(networkId)) {
      return res.status(400).json({ error: 'Invalid network ID format' });
    }

    if (!suspensionToken) {
      return res.status(400).json({ error: 'Suspension token is required' });
    }

    // Get network details
    const network = await sql<Network[]>`
      SELECT * FROM networks 
      WHERE id = ${networkId} AND suspension_token = ${suspensionToken}
    `;

    if (network.length === 0) {
      return res.status(404).json({ error: 'Network not found or invalid suspension token' });
    }

    // Check if network is actually suspended
    if (network[0].suspension_status !== 'temporarily_suspended') {
      return res.status(400).json({ error: 'Network is not suspended' });
    }

    // Check if suspension has expired
    const now = new Date();
    if (network[0].suspension_expires_at && new Date(network[0].suspension_expires_at) < now) {
      return res.status(400).json({ error: 'Suspension period has expired. Network cannot be restored.' });
    }

    // Check if user has permission (original suspender or admin)
    const member = await sql<NetworkMember[]>`
      SELECT role FROM network_members 
      WHERE network_id = ${networkId} AND user_id = ${userId}
    `;

    const canUnsuspend = network[0].suspended_by === userId || 
                        (member.length > 0 && ['creator', 'admin'].includes(member[0].role));

    if (!canUnsuspend) {
      return res.status(403).json({ error: 'Only the original suspender or network admins can restore the network' });
    }

    // Remove suspension and restore original name
    const originalName = network[0].name.replace(' (suspended)', '');
    
    await sql`
      UPDATE networks 
      SET 
        suspension_status = 'active',
        suspended_at = NULL,
        suspended_by = NULL,
        suspension_token = NULL,
        suspension_expires_at = NULL,
        name = ${originalName}
      WHERE id = ${networkId}
    `;

    // Clear caches
    await cacheInvalidatePattern(`network:${networkId}:*`);
    await cacheInvalidatePattern(`user:*:networks`);
    await cacheInvalidatePattern(`recommendations:*:${networkId}`);

    // Emit network restoration event
    await emitNetworkEvent('network_restored', networkId, {
      restoredBy: userId,
      restoredAt: new Date()
    });

    // Log network restoration
    logger.info('Network restored', {
      networkId,
      restoredBy: userId,
      networkName: originalName
    });

    res.json({ 
      message: 'Network restored successfully',
      networkName: originalName
    });
  } catch (error) {
    logger.error('Error restoring network:', error);
    res.status(500).json({ error: 'Failed to restore network' });
  }
}

// Cleanup function for expired suspensions (called by scheduler)
export async function cleanupExpiredSuspensions() {
  try {
    const now = new Date();
    
    // Find networks with expired suspensions
    const expiredNetworks = await sql<Network[]>`
      SELECT id, name, suspended_by
      FROM networks 
      WHERE suspension_status = 'temporarily_suspended'
      AND suspension_expires_at < ${now}
    `;

    if (expiredNetworks.length === 0) {
      logger.info('No expired network suspensions found');
      return;
    }

    // Process each expired network
    for (const network of expiredNetworks) {
      try {
        // Delete all network-related data
        await sql.begin(async sql => {
          // Delete connection requests
          await sql`DELETE FROM connection_requests WHERE network_id = ${network.id}`;
          
          // Delete recommendations
          await sql`DELETE FROM user_recommendations WHERE network_id = ${network.id}`;
          
          // Delete network goals and member selections
          await sql`DELETE FROM network_member_goals WHERE network_id = ${network.id}`;
          await sql`DELETE FROM network_goals WHERE network_id = ${network.id}`;
          
          // Delete pending join requests
          await sql`DELETE FROM pending_network_joins WHERE network_id = ${network.id}`;
          
          // Delete invitations
          await sql`DELETE FROM network_invitations WHERE network_id = ${network.id}`;
          
          // Delete network members
          await sql`DELETE FROM network_members WHERE network_id = ${network.id}`;
          
          // Finally delete the network
          await sql`DELETE FROM networks WHERE id = ${network.id}`;
        });

        // Clear caches
        await cacheInvalidatePattern(`network:${network.id}:*`);
        await cacheInvalidatePattern(`user:*:networks`);
        await cacheInvalidatePattern(`recommendations:*:${network.id}`);

        // Emit network deletion event
        await emitNetworkEvent('network_permanently_deleted', network.id, {
          reason: 'suspension_expired',
          originalSuspendedBy: network.suspended_by,
          deletedAt: new Date()
        });

        logger.info('Expired suspended network permanently deleted', {
          networkId: network.id,
          networkName: network.name,
          originalSuspendedBy: network.suspended_by
        });
      } catch (error) {
        logger.error('Error deleting expired suspended network', {
          networkId: network.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    logger.info(`Processed ${expiredNetworks.length} expired network suspensions`);
  } catch (error) {
    logger.error('Error during expired suspension cleanup:', error);
    throw error;
  }
}