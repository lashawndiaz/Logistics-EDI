const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const axios = require("axios");

// Initialize Firebase Admin cleanly without credentials 
// Because it runs inside Firebase natively, it self-authenticates!
admin.initializeApp();
const db = admin.database();

/**
 * INBOUND ENDPOINT: POST /edi856
 * Captures and validates shipping notices sent by other teams.
 */
exports.edi856 = onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const groupToken = req.headers['x-group-token'];
      const senderId = req.headers['x-sender-id'];
      const receiverId = req.headers['x-receiver-id'];
      const transactionType = req.headers['x-transaction-type'];

      // --- MIDDLEWARE CONTRACT VALIDATION ---
      if (!groupToken || groupToken !== process.env.MY_GROUP_TOKEN) {
        logger.warn(`Unauthorized token leak from sender: ${senderId}`);
        return res.status(401).json({
          success: false,
          message: "401 UNAUTHORIZED: Missing or invalid X-Group-Token value.",
          status_code: 401
        });
      }

      if (!senderId || !receiverId || !transactionType) {
        return res.status(400).json({
          success: false,
          message: "400 BAD_REQUEST: Structural contract header missing.",
          status_code: 400
        });
      }

      const { header, logistics_info } = req.body;
      if (!header || !header.asn_id || !logistics_info?.tracking_number) {
        return res.status(400).json({
          success: false,
          message: "400 BAD_REQUEST: Schema field mismatch ('asn_id' or 'tracking_number' missing).",
          status_code: 400
        });
      }
      // --- END MIDDLEWARE VALIDATION ---

      // Write parsed EDI transaction payload to your Realtime Database log tree
      const logRef = db.ref('inbound_edi_logs');
      const newLog = await logRef.push({
        type: 'INBOUND',
        edi_code: '856',
        asn_id: header.asn_id,
        sender: senderId,
        carrier: logistics_info.carrier || 'PrimeRoute Logistics',
        tracking_number: logistics_info.tracking_number,
        status: logistics_info.status,
        timestamp: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: "EDI message received and processed successfully",
        transaction_id: newLog.key,
        status_code: 200
      });

    } catch (error) {
      logger.error("Inbound Pipeline Failure:", error);
      return res.status(500).json({
        success: false,
        message: `500 SERVER_ERROR: ${error.message}`,
        status_code: 500
      });
    }
  });
});

/**
 * OUTBOUND ENDPOINT: PATCH /dispatch214
 * Triggered by your dashboard client to route status updates to partner groups.
 */
exports.dispatch214 = onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== "PATCH") {
      return res.status(405).json({ success: false, message: "Use PATCH method." });
    }

    try {
      const { targetReceiverId, trackingNumber, linkedAsn, statusCode, statusDesc, location } = req.body;

      let partnerEndpoint = '';
      if (targetReceiverId === 'CUST001') partnerEndpoint = process.env.VITE_CUSTOMER_URL;
      else if (targetReceiverId === 'RETL001') partnerEndpoint = process.env.VITE_RETAILER_URL;
      else if (targetReceiverId === 'MANU001') partnerEndpoint = process.env.VITE_MANUFACTURER_URL;
      else if (targetReceiverId === 'SUPP001') partnerEndpoint = process.env.VITE_SUPPLIER_URL;

      if (!partnerEndpoint) {
        return res.status(400).json({ success: false, message: `Receiver [${targetReceiverId}] endpoint not configured.` });
      }

      const outboundPayload = {
        header: {
          transaction_set: "214",
          tracking_number: trackingNumber,
          linked_asn: linkedAsn,
          date: new Date().toISOString().split('T')[0],
          sender_id: "LOGI001",
          receiver_id: targetReceiverId
        },
        shipment_status: {
          status_code: statusCode,
          status_description: statusDesc,
          location: location,
          timestamp: new Date().toISOString()
        }
      };

      // Push transactional patch directly over to their hosted platform endpoint
      const targetResponse = await axios.patch(partnerEndpoint, outboundPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Group-Token': 'REPLACE_WITH_TARGET_PARTNER_PRIVATE_TOKEN', 
          'X-Sender-ID': 'LOGI001',
          'X-Receiver-ID': targetReceiverId,
          'X-Transaction-Type': '214'
        }
      });

      // Keep an archival record copy inside your own local logs tree
      await db.ref('outbound_edi_logs').push({
        ...outboundPayload,
        dispatchedAt: new Date().toISOString(),
        partnerResponseCode: targetResponse.status
      });

      return res.status(200).json({
        success: true,
        message: "Outbound EDI 214 pipeline dispatched via Cloud Functions Middleware",
        partner_data: targetResponse.data
      });

    } catch (error) {
      logger.error("Outbound Flow Error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  });
});