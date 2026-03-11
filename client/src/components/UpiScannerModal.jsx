import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { X, QrCode, IndianRupee } from "lucide-react";
import toast from "react-hot-toast";
import { Html5QrcodeScanner } from "html5-qrcode";
import api from "../api/axios";

const parseUpiUrl = (upiString) => {
  try {
    if (!upiString.startsWith("upi://")) return null;
    const url = new URL(upiString);
    const params = Object.fromEntries(url.searchParams.entries());
    return {
      merchantUpiId: params.pa || "",
      merchantName: params.pn || "",
    };
  } catch {
    return null;
  }
};

const UpiScannerModal = ({ open, onClose, tripId, onRecorded }) => {
  const [scanStep, setScanStep] = useState("scanning");
  const [scannerError, setScannerError] = useState("");
  const [form, setForm] = useState({
    merchantUpiId: "",
    merchantName: "",
    amount: "",
    utrReference: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const scannerRef = useRef(null);
  const html5ScannerRef = useRef(null);

  useEffect(() => {
    if (!open) {
      if (html5ScannerRef.current) {
        html5ScannerRef.current.clear().catch(() => {});
        html5ScannerRef.current = null;
      }
      setScanStep("scanning");
      setScannerError("");
      setForm({
        merchantUpiId: "",
        merchantName: "",
        amount: "",
        utrReference: "",
      });
      return;
    }

    if (!scannerRef.current) return;

    const scanner = new Html5QrcodeScanner(
      scannerRef.current.id,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
      },
      false
    );

    html5ScannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        const parsed = parseUpiUrl(decodedText);
        if (!parsed) {
          setScannerError("Scanned code is not a valid UPI QR. Try again.");
          return;
        }
        setForm((prev) => ({
          ...prev,
          merchantUpiId: parsed.merchantUpiId,
          merchantName: parsed.merchantName,
        }));
        setScanStep("details");
        scanner.clear().catch(() => {});
      },
      (errorMessage) => {
        // Suppress noisy continuous errors; show only meaningful issues
        if (
          typeof errorMessage === "string" &&
          errorMessage.toLowerCase().includes("camera")
        ) {
          setScannerError("Unable to access camera. Please check permissions.");
        }
      }
    );

    return () => {
      scanner.clear().catch(() => {});
      html5ScannerRef.current = null;
    };
  }, [open]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tripId) {
      toast.error("Missing trip information");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!form.utrReference || form.utrReference.length < 6) {
      toast.error("Enter a valid UTR / reference ID");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        tripId,
        merchantUpiId: form.merchantUpiId,
        merchantName: form.merchantName || "Unknown",
        amount: Number(form.amount),
        utrReference: form.utrReference,
      };
      const res = await api.post("/payments/record-upi", payload);
      toast.success(res.data?.message || "UPI expense recorded");
      onRecorded?.(res.data?.data);
      onClose();
    } catch (error) {
      const message =
        error.response?.data?.message ||
        "Failed to record UPI payment. Please try again.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-gray-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Record UPI expense
              </p>
              <p className="text-[11px] text-gray-500">
                Scan the merchant QR and confirm the details.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {scanStep === "scanning" && (
            <div className="space-y-3">
              <div
                id="upi-qr-scanner"
                ref={scannerRef}
                className="w-full rounded-xl border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center min-h-[260px]"
              >
                <div className="flex flex-col items-center gap-2 text-center px-4">
                  <QrCode className="w-10 h-10 text-indigo-500" />
                  <p className="text-sm font-medium text-gray-800">
                    Point your camera at the UPI QR
                  </p>
                  <p className="text-xs text-gray-500">
                    Ensure the full QR code is visible and well-lit.
                  </p>
                </div>
              </div>
              {scannerError && (
                <p className="text-xs text-red-500">{scannerError}</p>
              )}
            </div>
          )}

          {scanStep === "details" && (
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="merchantName"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Merchant name
                  </label>
                  <input
                    id="merchantName"
                    name="merchantName"
                    type="text"
                    value={form.merchantName}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Merchant / shop name"
                  />
                </div>
                <div>
                  <label
                    htmlFor="merchantUpiId"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Merchant UPI ID
                  </label>
                  <input
                    id="merchantUpiId"
                    name="merchantUpiId"
                    type="text"
                    value={form.merchantUpiId}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs shadow-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="merchant@upi"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="amount"
                    className="block text-xs font-medium text-gray-700"
                  >
                    Amount (₹)
                  </label>
                  <div className="mt-1 flex items-center rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500">
                    <IndianRupee className="w-3 h-3 text-gray-400 mr-1" />
                    <input
                      id="amount"
                      name="amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amount}
                      onChange={handleChange}
                      className="w-full bg-transparent text-xs outline-none"
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="utrReference"
                    className="block text-xs font-medium text-gray-700"
                  >
                    UTR / transaction ID
                  </label>
                  <input
                    id="utrReference"
                    name="utrReference"
                    type="text"
                    value={form.utrReference}
                    onChange={handleChange}
                    className="mt-1 block w-full rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 text-xs shadow-sm tracking-[0.15em] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="12-digit reference ID"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-medium text-white shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {submitting ? "Recording..." : "Record expense"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

UpiScannerModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  tripId: PropTypes.string,
  onRecorded: PropTypes.func,
};

export default UpiScannerModal;

