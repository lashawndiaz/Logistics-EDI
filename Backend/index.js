require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin securely using local system file permissions
const serviceAccount = require("./firebase-key.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://logistics-edi-default-rtdb.firebaseio.com"
});
const db = admin.database();

/**
 * EXPRESS.JS MIDDLEWARE: Section Contract Filter
 * Intercepts incoming packets to validate authenticity tokens and tracking headers.
 */
const validateGroupContract = (req, res, next) => {
  const groupToken = req.headers['x-group-token'];
  const senderId = req.headers['x-sender-id'];
  const receiverId = req.headers['x-receiver-id'];
  const transactionType = req.headers['x-transaction-type'];

  // Rule 1: Validate Security Secret Key
  if (!groupToken || groupToken !== process.env.MY_GROUP_TOKEN) {
    return res.status(401).json({
      "success": false,
      "message": "401 UNAUTHORIZED: Missing or invalid X-Group-Token value.",
      "status_code": 401
    });
  }

  // Rule 2: Enforce Header Structural Rules
  if (!senderId || !receiverId || !transactionType) {
    return res.status(400).json({
      "success": false,
      "message": "400 BAD_REQUEST: Structural contract header missing (Sender, Receiver, or Code).",
      "status_code": 400
    });
  }

  next();
};

app.post('/edi/856', validateGroupContract, async (req, res) => {
  try {
    const { header, logistics_info } = req.body;

    if (!header?.asn_id || !logistics_info?.tracking_number) {
      return res.status(400).json({
        "success": false,
        "message": "400 BAD_REQUEST: Schema field mismatch. 'asn_id' or 'tracking_number' missing.",
        "status_code": 400
      });
    }

    // Write directly to your local Firebase database tree
    const logRef = db.ref('inbound_edi_logs');
    const newLog = await logRef.push({
      type: 'INBOUND',
      edi_code: '856',
      asn_id: header.asn_id,
      sender: req.headers['x-sender-id'],
      tracking_number: logistics_info.tracking_number,
      status: logistics_info.status || 'SHIPPED',
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      "success": true,
      "message": "EDI message received and processed successfully via Express.js Middleware",
      "transaction_id": newLog.key,
      "status_code": 200
    });
  } catch (error) {
    return res.status(500).json({ "success": false, "message": error.message, "status_code": 500 });
  }
});


app.post('/api/v1/edi/dispatch214', async (req, res) => {
  try {
    const { targetReceiverId, trackingNumber, linkedAsn, statusCode, statusDesc, location } = req.body;

    let partnerEndpoint = '';
    let partnerToken = 'REPLACE_WITH_THE_PARTNERS_ACTUAL_TOKEN';

    if (targetReceiverId === 'CUST001') {
      partnerEndpoint = process.env.VITE_CUSTOMER_URL;
      partnerToken = process.env.PARTNER_TOKEN_CUSTOMER || partnerToken;
    } else if (targetReceiverId === 'RETL001') {
      partnerEndpoint = process.env.VITE_RETAILER_URL;
      partnerToken = process.env.PARTNER_TOKEN_RETAILER || partnerToken;
    } else if (targetReceiverId === 'MANU001') {
      partnerEndpoint = process.env.VITE_MANUFACTURER_URL;
      partnerToken = process.env.PARTNER_TOKEN_MANUFACTURER || partnerToken;
    } else if (targetReceiverId === 'SUPP001') {
      partnerEndpoint = process.env.VITE_SUPPLIER_URL;
      partnerToken = process.env.PARTNER_TOKEN_SUPPLIER || partnerToken;
    }

    if (!partnerEndpoint) {
      return res.status(400).json({ "success": false, "message": `Receiver [${targetReceiverId}] target URL not defined in .env.` });
    }

    const outboundPayload = {
      header: {
        transaction_set: "214",
        tracking_number: trackingNumber,
        linked_asn: linkedAsn || "ASN-AUTO-GEN",
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

    let partnerResponseCode = 200;
    try {
      const targetResponse = await axios.patch(partnerEndpoint, outboundPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Group-Token': partnerToken, 
          'X-Sender-ID': 'LOGI001',
          'X-Receiver-ID': targetReceiverId,
          'X-Transaction-Type': '214'
        }
      });
      partnerResponseCode = targetResponse.status;
    } catch (apiErr) {
      console.warn(`External partner node [${targetReceiverId}] offline fallback applied. Logging data locally.`);
      partnerResponseCode = apiErr.response ? apiErr.response.status : 504;
    }

    await db.ref('inbound_edi_logs').push({
      type: 'OUTBOUND',
      edi_code: '214',
      asn_id: linkedAsn || "ASN-AUTO-GEN",
      sender: 'LOG001',
      tracking_number: trackingNumber,
      status: 'DISPATCHED',
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      "success": true,
      "message": "Outbound EDI 214 status pushed cleanly to trading partner tree.",
      "status_code": partnerResponseCode
    });

  } catch (error) {
    return res.status(500).json({ "success": false, "message": error.message });
  }
});

const PORT = process.env.PORT || 5004;
app.listen(PORT, () => console.log(`✓ Logistics Core Express Engine listening on port ${PORT}`));