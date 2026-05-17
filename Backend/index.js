const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const axios = require("axios");
const app = express();

app.use(cors({ origin: true }));
app.use(express.json()); 

if (admin.apps.length === 0) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.VITE_FIREBASE_DATABASE_URL
      });
    } else {
      admin.initializeApp();
    }
  } catch (initError) {
    console.error("Firebase Admin Initialization Failed:", initError.message);
  }
}

const db = admin.database();

app.post("/api/v1/edi/edi856", async (req, res) => {
  try {
    const groupToken = req.headers['x-group-token'];
    const senderId = req.headers['x-sender-id'];
    const receiverId = req.headers['x-receiver-id'];
    const transactionType = req.headers['x-transaction-type'];

    if (!groupToken || groupToken !== process.env.MY_GROUP_TOKEN) {
      console.warn(`Unauthorized token leak attempt from sender: ${senderId}`);
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

    const { header, logistics_info, shipment_detail } = req.body;
    if (!header || !header.asn_id || !logistics_info?.tracking_number) {
      return res.status(400).json({
        success: false,
        message: "400 BAD_REQUEST: Schema field mismatch ('asn_id' or 'tracking_number' missing).",
        status_code: 400
      });
    }

    const logRef = db.ref('inbound_edi_logs');
    const newLog = await logRef.push({
      type: 'INBOUND',
      edi_code: '856',
      asn_id: header.asn_id,
      sender: senderId,
      carrier: logistics_info.carrier || 'PrimeRoute Logistics',
      tracking_number: logistics_info.tracking_number,
      status: logistics_info.status,
      items: shipment_detail?.items || [],
      timestamp: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: "EDI message received and processed successfully",
      transaction_id: newLog.key,
      status_code: 200
    });

  } catch (error) {
    console.error("Inbound Pipeline Failure:", error);
    return res.status(500).json({
      success: false,
      message: `500 SERVER_ERROR: ${error.message}`,
      status_code: 500
    });
  }
});

app.patch("/api/v1/edi/dispatch214", async (req, res) => {
  try {
    const { targetReceiverId, trackingNumber, linkedAsn, statusCode, statusDesc, location } = req.body;

    let partnerEndpoint = '';
    let partnerToken = '';

    if (targetReceiverId === 'CUST001') {
      partnerEndpoint = process.env.VITE_CUSTOMER_URL;
      partnerToken = process.env.TOKEN_CUSTOMER;
    } else if (targetReceiverId === 'RETL001') {
      partnerEndpoint = process.env.VITE_RETAILER_URL;
      partnerToken = process.env.TOKEN_RETAILER;
    } else if (targetReceiverId === 'MANU001') {
      partnerEndpoint = process.env.VITE_MANUFACTURER_URL;
      partnerToken = process.env.TOKEN_MANUFACTURER;
    } else if (targetReceiverId === 'SUPP001') {
      partnerEndpoint = process.env.VITE_SUPPLIER_URL;
      partnerToken = process.env.TOKEN_SUPPLIER;
    }

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

    let targetResponseStatus = 500;
    let targetResponseData = null;

    try {
      const targetResponse = await axios.patch(partnerEndpoint, outboundPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Group-Token': partnerToken || 'FALLBACK_TOKEN', 
          'X-Sender-ID': 'LOGI001',
          'X-Receiver-ID': targetReceiverId,
          'X-Transaction-Type': '214'
        }
      });
      targetResponseStatus = targetResponse.status;
      targetResponseData = targetResponse.data;
    } catch (networkError) {
      console.error(`Partner dispatch target hit an error stream: ${networkError.message}`);
      targetResponseStatus = networkError.response ? networkError.response.status : 503;
      targetResponseData = networkError.response ? networkError.response.data : { error: "Target platform unreachable" };
    }

    await db.ref('outbound_edi_logs').push({
      ...outboundPayload,
      dispatchedAt: new Date().toISOString(),
      partnerResponseCode: targetResponseStatus
    });

    return res.status(targetResponseStatus >= 400 ? 400 : 200).json({
      success: targetResponseStatus < 400,
      message: targetResponseStatus < 400 ? "Outbound EDI 214 dispatched cleanly" : "Partner application rejected payload execution",
      partner_status: targetResponseStatus,
      partner_data: targetResponseData
    });

  } catch (error) {
    console.error("Outbound Flow Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5001;
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => console.log(`Local EDI Middleware instance running on port: ${PORT}`));
}

module.exports = app;