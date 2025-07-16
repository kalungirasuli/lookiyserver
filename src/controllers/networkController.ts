import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import sql from '../utils/db';
import { Network, NetworkMember } from '../models/database';
import { generateAndUploadAvatar } from '../utils/avatar';
import { generateCustomQR } from '../utils/qrGenerator';
import { uploadToGCS } from '../utils/storage';
import logger from '../utils/logger';
import crypto from 'crypto';

interface CreateNetworkBody {
  title: string;
  type: 'public' | 'private';
  passcode?: string;
  description?: string;
}

export async function createNetwork(
  req: AuthRequest,
  res: Response
) {
  const { title, type, passcode, description } = req.body as CreateNetworkBody;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  if (!title || !type) {
    return res.status(400).json({ message: 'Title and type are required' });
  }

  // Validate passcode requirements
  if (type === 'private' && !passcode) {
    return res.status(400).json({ message: 'Passcode is required for private networks' });
  }
  if (type === 'public' && passcode) {
    return res.status(400).json({ message: 'Public networks cannot have passcodes' });
  }

  try {
    // Generate unique @tagname
    const baseTag = title.toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
      .substring(0, 20); // Limit length
    const randomSuffix = crypto.randomBytes(3).toString('hex');
    const tagName = `@${baseTag}${randomSuffix}`;

    // Create network and set creator as admin in a transaction
    const result = await sql.begin(async sql => {
      // Create network
      const networks = await sql<Network[]>`
        INSERT INTO networks (
          name, tag_name, description, is_private, passcode
        ) VALUES (
          ${title},
          ${tagName},
          ${description || null},
          ${type === 'private'},
          ${type === 'private' && passcode ? passcode : null}
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

      return network;
    });

    logger.info('Network created successfully', {
      networkId: result.id,
      creatorId: userId,
      tagName: result.tag_name
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

    logger.info('Network updated successfully', {
      networkId: id,
      updatedBy: userId,
      updatedFields: Object.keys(updates),
      privacyChanged: updates.isPrivate !== undefined
    });

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