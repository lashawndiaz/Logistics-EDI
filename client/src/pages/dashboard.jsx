import { useState, useEffect } from 'react';
import {
  Package,
  Inbox,
  Truck,
  RefreshCw,
  Send,
  Warehouse,
  Store,
  Hotel,
  Clock,
  Loader2,
  CheckCircle,
  AlertCircle,
  Calendar as CalendarIcon,
  Activity
} from 'lucide-react';
import { db, ref, onValue, push, update } from '../lib/firebase';

const OUTBOUND_RECEIVERS = [
  { id: 'MANU001', name: 'Manufacturer (MANU001)', code: 'RAW' },
  { id: 'RETL001', name: 'Retailer (RETL001)', code: 'FIN' },
  { id: 'CUST001', name: 'Customer (CUST001)', code: 'SKU' }
];

const ROUTES = [
  'MNL-LGN', 'LGN-MNL',
  'LGN-LGN', 'MNL-MNL'
];

const STATUS_CODES = [
  'STAT-PKUP', 'STAT-RCVD', 'STAT-MFG', 
  'STAT-PROC', 'STAT-WHSE', 'STAT-OUTF', 'STAT-DLVD'
];

function generateShipmentId(date, route, code) {
  const random = Math.floor(1000 + Math.random() * 9000);
  return `LOG-${date}-${route}-${code}-${random}`;
}

function getCurrentDateYYYYMMDD() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export default function LogisticsDashboard() {
  const [inboundSender, setInboundSender] = useState('SUPP001');
  const [inboundJson, setInboundJson] = useState('');
  const [outboundReceiver, setOutboundReceiver] = useState('MANU001');
  const [shipmentId, setShipmentId] = useState('');
  const [route, setRoute] = useState('MNL-LGN');
  const [carrier, setCarrier] = useState('');
  const [eta, setEta] = useState(new Date().toISOString().split('T')[0]);
  const [auditTrail, setAuditTrail] = useState([]);
  const [statusCode, setStatusCode] = useState('STAT-PKUP');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [selectedAsnId, setSelectedAsnId] = useState('ASN-AUTO-GEN');

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const date = getCurrentDateYYYYMMDD();
    const receiver = OUTBOUND_RECEIVERS.find(r => r.id === outboundReceiver);
    const code = receiver ? receiver.code : 'RAW';
    setShipmentId(generateShipmentId(date, route, code));
  }, [outboundReceiver, route]);

  // Integrated Realtime Database Sync (Unifies direct writes and Postman webhook logs)
  useEffect(() => {
    const logsRef = ref(db, 'inbound_edi_logs');
    const unsubscribe = onValue(logsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const formattedLogs = Object.entries(data).map(([id, value]) => ({
          id,
          timestamp: value.timestamp || new Date().toISOString(),
          receive_from: value.sender || 'External Partner',
          edi_code: value.edi_code || '856',
          status: value.status || 'RECEIVED',
          asn_id: value.asn_id || 'ASN-UNKNOWN',
          tracking_number: value.tracking_number || ''
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setAuditTrail(formattedLogs);
      }
    });
    return () => unsubscribe();
  }, []);

  const addToAuditTrail = async (type, ediCode, status, message, data = {}) => {
    try {
      const transactionData = {
        type,
        edi_code: ediCode,
        status,
        message,
        timestamp: new Date().toISOString(),
        direction: type,
        ...data
      };
      await push(ref(db, 'inbound_edi_logs'), {
        sender: data.receive_from || 'LOG001',
        edi_code: ediCode,
        status: status,
        asn_id: data.header?.asn_id || 'ASN-GEN',
        tracking_number: data.tracking_number || shipmentId,
        timestamp: transactionData.timestamp
      });
    } catch (error) {
      console.error('Error pushing to Firebase:', error);
    }
  };

  // NEW UPDATED CODE: Strictly handles real data from Postman review with NO manipulation
  const handleInboundSubmit = async () => {
    try {
      if (!selectedTransactionId || !inboundJson.trim()) {
        showToast("Please click 'Review Payload' on a real Postman transaction first!", "error");
        return;
      }

      const parsed = JSON.parse(inboundJson);
      
      if (!parsed.header?.asn_id || !parsed.logistics_info?.tracking_number) {
        throw new Error("Invalid payload structure. Missing tracking fields.");
      }

      await update(ref(db, `inbound_edi_logs/${selectedTransactionId}`), {
        status: 'INTERPRETED',
        timestamp: new Date().toISOString()
      });

      showToast("Real EDI Payload Interpreted Successfully!");
    } catch (error) {
      showToast("Processing Error: " + error.message, 'error');
    }
  };

  // Connected proxy to dispatch updates through your Express Backend Port Engine cleanly (Aligned to Local 5004 Engine)
  const handleForwardEDI = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:5007/api/v1/edi/dispatch214', {
        method: 'POST', 
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          targetReceiverId: outboundReceiver,
          trackingNumber: shipmentId,
          linkedAsn: selectedAsnId,
          statusCode: statusCode,
          statusDesc: `Shipment running on route ${route} via ${carrier || 'PrimeRoute Carrier'}`,
          location: route
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.message || 'Failed to dispatch via proxy engine');

      if (selectedTransactionId) {
        await update(ref(db, `inbound_edi_logs/${selectedTransactionId}`), {
          status: 'PROCESSED'
        });
      }

      showToast(`EDI 214 dispatched securely to partner!`);
      setSelectedTransactionId(null);
      setInboundJson('');
    } catch (error) {
      showToast("Forwarding Core Error: " + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Structured payload generation to use valid JSON Object Formatting instead of outer array strings
  const handleProcess = (transaction) => {
    const json = JSON.stringify({
      header: { 
        asn_id: transaction.asn_id || "ASN-PENDING", 
        linked_po: "PO-PENDING" 
      },
      logistics_info: { 
        carrier: "PrimeRoute", 
        tracking_number: transaction.tracking_number || "LOG-PENDING" 
      },
      shipment_detail: { 
        item_id: "ITEM-001", 
        po_number: "PO-PENDING", 
        qty: 1, 
        uom: "EA" 
      }
    }, null, 2);
    setInboundJson(json);
    setSelectedTransactionId(transaction.id);
    setSelectedAsnId(transaction.asn_id || 'ASN-AUTO-GEN');
    setInboundSender(transaction.receive_from || 'SUPP001');
    showToast("Transaction data loaded for interpretation");
  };

  const handleRegenerateShipmentId = () => {
    const date = getCurrentDateYYYYMMDD();
    const receiver = OUTBOUND_RECEIVERS.find(r => r.id === outboundReceiver);
    const code = receiver ? receiver.code : 'RAW';
    setShipmentId(generateShipmentId(date, route, code));
    showToast("Shipment ID regenerated");
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {isLoading && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-zinc-900/90 border border-zinc-800/50 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-5 max-w-sm text-center">
            <div className="relative">
              <div className="absolute inset-0 blur-xl bg-emerald-500/20 animate-pulse rounded-full" />
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin relative z-10" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">Synchronizing Node</p>
              <p className="text-sm text-zinc-400">Processing secure EDI handshake with supply chain partner...</p>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed top-8 right-8 z-[70] animate-in slide-in-from-right-full duration-500 ease-out">
          <div className={`flex items-center gap-4 px-5 py-4 rounded-xl border shadow-2xl backdrop-blur-xl ${
            toast.type === 'error' 
              ? 'bg-red-950/40 border-red-500/30 text-red-200 shadow-red-950/20' 
              : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200 shadow-emerald-950/20'
          }`}>
            <div className={`p-2 rounded-lg ${toast.type === 'error' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
              {toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-red-400" /> : <CheckCircle className="w-5 h-5 text-emerald-400" />}
            </div>
            <p className="text-sm font-medium pr-4">{toast.message}</p>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto p-8 space-y-8">
        <header className="flex items-center justify-between border-b border-zinc-800/50 pb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl shadow-lg shadow-emerald-900/20 ring-1 ring-white/10">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-400">
                PrimeRoute Logistics 
              </h1>
              <p className="text-sm text-zinc-500 font-medium">Enterprise Supply Chain Integration </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950/30 border border-emerald-500/20 rounded-full">
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl group hover:border-emerald-500/20 transition-all duration-300">
              <div className="px-6 py-5 border-b border-zinc-800/50 bg-zinc-900/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                      <Inbox className="w-5 h-5 text-emerald-500" />
                    </div>
                    <h3 className="text-base font-bold text-white">EDI Inbound</h3>
                  </div>
                  <Activity className="w-4 h-4 text-zinc-700" />
                </div>
              </div>
              <div className="p-6 space-y-6">
                <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-2">
                  <p className="text-[11px] text-zinc-500 font-bold uppercase tracking-widest">Active Monitoring</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    EDI 856 Advanced Ship Notices from supply chain partners.
                  </p>
                </div>
                
                <button
                  onClick={handleInboundSubmit}
                  className="w-full group/btn relative overflow-hidden bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-emerald-900/20 active:scale-[0.98]"
                >
                  <div className="relative z-10 flex items-center justify-center gap-2 text-sm uppercase tracking-wider">
                    <RefreshCw className="w-4 h-4 group-hover/btn:rotate-180 transition-transform duration-500" />
                    Process
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl hover:border-emerald-500/20 transition-all duration-300">
              <div className="px-6 py-5 border-b border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Truck className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h3 className="text-base font-bold text-white">Outbound EDI Notice 856/214</h3>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-zinc-950/50 rounded-lg border border-zinc-800/50">
  
                </div>
              </div>
              
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Target Partner</label>
                    <select value={outboundReceiver} onChange={(e) => setOutboundReceiver(e.target.value)} className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all outline-none appearance-none">
                      {OUTBOUND_RECEIVERS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Logistics Route</label>
                    <select value={route} onChange={(e) => setRoute(e.target.value)} className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all outline-none appearance-none">
                      {ROUTES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-end">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Shipment ID</label>
                      <button onClick={handleRegenerateShipmentId} className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase tracking-tighter transition-colors">Re-generate</button>
                    </div>
                    <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm font-mono text-emerald-500/90 shadow-inner">
                      {shipmentId}
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status Code</label>
                      <select value={statusCode} onChange={(e) => setStatusCode(e.target.value)} className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all outline-none appearance-none">
                        {STATUS_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Carrier</label>
                      <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all outline-none appearance-none">
                        <option value="">Select Carrier</option>
                        <option value="FAST">PrimeRoute Carrier</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">ETA Projection</label>
                    <div className="relative">
                      <input 
                        type="date" 
                        value={eta} 
                        onChange={(e) => setEta(e.target.value)} 
                        className="w-full bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all outline-none text-zinc-200 [color-scheme:dark] relative z-10" 
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleForwardEDI}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-emerald-900/20 uppercase text-xs tracking-widest active:scale-[0.98]"
                  >
                    <Send className="w-4 h-4" /> Forward EDI Dispatch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-2xl overflow-hidden backdrop-blur-sm shadow-xl">
          <div className="px-6 py-5 border-b border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-emerald-500" />
              </div>
              <h3 className="text-base font-bold text-white">Real-time Inbound Monitor </h3>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-zinc-950/60 text-zinc-500 border-b border-zinc-800/50">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Transmission Date</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Origin/Destination</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Protocol</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Transaction Status</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest text-right">Integrity Check</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/30">
                {auditTrail.map((entry) => (
                  <tr key={entry.id} className="hover:bg-zinc-800/20 transition-all duration-150 group">
                    <td className="px-6 py-4 text-xs font-medium text-zinc-400 font-mono">
                      {new Date(entry.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-zinc-200">{entry.receive_from}</span>
                        {entry.tracking_number && (
                          <span className="text-[10px] text-zinc-500 font-mono mt-0.5">{entry.tracking_number}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-zinc-950 text-emerald-500/80 border border-emerald-500/10 rounded text-[10px] font-black tracking-tighter">
                        EDI {entry.edi_code}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide ${
                        entry.status === 'PROCESSED' || entry.status === 'DISPATCHED' || entry.status === 'SHIPPED' || entry.status.includes('200') || entry.status === 'INTERPRETED'
                          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-400' 
                          : 'bg-amber-500/5 border-amber-500/20 text-amber-400'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          entry.status === 'PROCESSED' || entry.status === 'DISPATCHED' || entry.status === 'SHIPPED' || entry.status.includes('200') || entry.status === 'INTERPRETED'
                            ? 'bg-emerald-500 animate-pulse' 
                            : 'bg-amber-500'
                        }`} />
                        {entry.status}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleProcess(entry)} 
                        className="text-[11px] font-black uppercase tracking-widest text-zinc-500 hover:text-emerald-500 transition-colors py-1 px-3 border border-transparent hover:border-emerald-500/20 rounded-lg bg-zinc-950/0 hover:bg-zinc-950/50"
                      >
                        Review Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}