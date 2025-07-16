import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import sql from '../utils/db';
import { Network } from '../models/database';
import { generateAndUploadAvatar } from '../utils/avatar';
import { generateCustomQR } from '../utils/qrGenerator';
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

  // Validate passcode for private networks
  if (type === 'private' && !passcode) {
    return res.status(400).json({ message: 'Passcode is required for private networks' });
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