import "./style.css";
import { initialCompany, sampleProducts, defaultCustomer } from "./data/mockData.js";
import { generateInvoicePDF, fetchPdfFromProtectedBackend, numberToWords } from "./services/pdfGenerator.js";
import { shareInvoiceFile, checkFileShareSupport, ShareStatus } from "./services/shareService.js";

// ==========================================================================
// Application State
// ==========================================================================
const state = {
    currentStep: "items", // "items" | "preview"
    company: { ...initialCompany },
    customer: { ...defaultCustomer },
    invoiceNumber: "INV-2026-0042",
    invoiceDate: new Date().toISOString().split("T")[0],
    // Selected items keyed by product id: { [id]: { ...product, qty: 1, discount: 0 } }
    selectedItems: {
        "item-1": { ...sampleProducts[0], qty: 1, discount: 100 },
        "item-2": { ...sampleProducts[1], qty: 2, discount: 0 }
    },
    searchQuery: "",
    selectedCategory: "All",
    shareLoadingState: null, // "preparing" | "opening" | null
    generatedPdf: null, // cache { blob, file, filename }
    supportStatus: checkFileShareSupport(),
    showFallbackModal: false,
    fallbackReason: "",
    // Requirement 19: Backend Protected URL test state
    useBackendUrlMode: false,
    backendEndpointUrl: "/api/v1/invoices/INV-2026-0042/pdf",
    backendAuthToken: "mock_jwt_token_sample_xyz"
};

// ==========================================================================
// Calculation Helpers
// ==========================================================================
function calculateTotals() {
    const items = Object.values(state.selectedItems);
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    items.forEach((item) => {
        const rate = Number(item.price || 0);
        const qty = Number(item.qty || 1);
        const disc = Number(item.discount || 0);
        const taxable = (rate * qty) - disc;
        const gstRate = Number(item.gstRate || 5);
        const gstAmount = (taxable * gstRate) / 100;

        subtotal += (rate * qty);
        discountTotal += disc;
        taxTotal += gstAmount;
    });

    const taxableTotal = Math.max(0, subtotal - discountTotal);
    const cgst = taxTotal / 2;
    const sgst = taxTotal / 2;
    const grandTotal = Math.round(taxableTotal + taxTotal);

    return {
        subtotal,
        discountTotal,
        taxableTotal,
        taxTotal,
        cgst,
        sgst,
        grandTotal
    };
}

// ==========================================================================
// Toast Notification
// ==========================================================================
function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
    <span>${type === "success" ? "✓" : type === "error" ? "⚠️" : "ℹ️"}</span>
    <span>${message}</span>
  `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ==========================================================================
// PDF Generation & WhatsApp Share Flow (Core Requirements)
// ==========================================================================

/**
 * Handle Native WhatsApp Share Click
 * Requirements:
 * 1. Preparing PDF...
 * 2. Opening Share...
 * 3. Native share sheet -> WhatsApp -> PDF attachment
 * 4. No direct URL in text, no automatic download
 * 5. Handle AbortError and Fallback
 */
async function handleShareInvoice() {
    const summary = calculateTotals();
    const items = Object.values(state.selectedItems);

    if (items.length === 0) {
        showToast("Please select at least 1 item to generate an invoice.", "error");
        return;
    }

    // Set loading state: "Preparing Invoice..." / "Preparing PDF..."
    state.shareLoadingState = "preparing";
    render();

    try {
        let pdfFile;

        // Support both client dynamic generation and Requirement 19 backend fetch:
        if (state.useBackendUrlMode) {
            showToast("Fetching protected PDF with Auth headers...", "info");
            const fetched = await fetchPdfFromProtectedBackend(state.backendEndpointUrl, {
                authToken: state.backendAuthToken,
                filename: `Invoice-${state.invoiceNumber}.pdf`
            });
            pdfFile = fetched.file;
        } else {
            // Direct high-fidelity PDF generation
            const generated = await generateInvoicePDF({
                invoiceNumber: state.invoiceNumber,
                invoiceDate: state.invoiceDate,
                company: state.company,
                customer: state.customer,
                items,
                summary
            });
            state.generatedPdf = generated;
            pdfFile = generated.file;
        }

        // Update loading state: "Opening Share..."
        state.shareLoadingState = "opening";
        render();

        // Check support before invoking
        const support = checkFileShareSupport(pdfFile);

        if (!support.supported) {
            state.shareLoadingState = null;
            state.showFallbackModal = true;
            state.fallbackReason = support.reason;
            render();
            return;
        }

        // Call Web Share API - native share sheet opens
        // On Android/iOS, user selects WhatsApp and it sends as an actual PDF file attachment!
        const result = await shareInvoiceFile({
            file: pdfFile,
            title: `Invoice ${state.invoiceNumber}`,
            text: `Tax Invoice #${state.invoiceNumber} for ${state.customer.name}`,
            onStatusChange: (status) => {
                if (status === ShareStatus.CANCELLED) {
                    showToast("Sharing was cancelled", "info");
                } else if (status === ShareStatus.SUCCESS) {
                    showToast("Invoice shared successfully!", "success");
                }
            }
        });

        if (result.unsupported) {
            state.showFallbackModal = true;
            state.fallbackReason = result.reason;
        } else if (result.error) {
            showToast(result.error, "error");
        }

    } catch (error) {
        if (error.name === "AbortError") {
            showToast("Share cancelled", "info");
        } else {
            console.error("Invoice sharing failed:", error);
            showToast(`Sharing failed: ${error.message}`, "error");
        }
    } finally {
        state.shareLoadingState = null;
        render();
    }
}

/**
 * Handle PDF Download (when user explicitly clicks "Download PDF")
 */
async function handleDownloadPdf() {
    try {
        showToast("Generating PDF download...", "info");
        const summary = calculateTotals();
        const items = Object.values(state.selectedItems);

        const generated = await generateInvoicePDF({
            invoiceNumber: state.invoiceNumber,
            invoiceDate: state.invoiceDate,
            company: state.company,
            customer: state.customer,
            items,
            summary
        });

        // Trigger explicit user download
        generated.doc.save(generated.filename);
        showToast(`Downloaded ${generated.filename}`, "success");
    } catch (error) {
        console.error("PDF download failed:", error);
        showToast("Failed to download PDF", "error");
    }
}

/**
 * Handle Browser Print
 */
function handlePrint() {
    window.print();
}

/**
 * Handle Direct WhatsApp Web Sharing (Desktop / Browser)
 * 1. Generates & downloads the invoice PDF (so user has the file ready to attach)
 * 2. Formats a professional invoice message with customer & total details
 * 3. Opens WhatsApp Web (https://web.whatsapp.com/send?phone=...&text=...) in new tab
 * 4. Displays helpful guide toast to attach the downloaded PDF
 */
async function handleShareWhatsAppWeb() {
    try {
        showToast("Preparing PDF for WhatsApp Web...", "info");
        const summary = calculateTotals();
        const items = Object.values(state.selectedItems);

        // 1. Generate & trigger download of PDF so user can attach it in WhatsApp Web
        const generated = await generateInvoicePDF({
            invoiceNumber: state.invoiceNumber,
            invoiceDate: state.invoiceDate,
            company: state.company,
            customer: state.customer,
            items,
            summary
        });
        generated.doc.save(generated.filename);

        // 2. Prepare customer phone number
        let rawPhone = (state.customer.mobile || "").replace(/\D/g, "");
        if (rawPhone.length === 10) {
            rawPhone = "91" + rawPhone; // Default country code for India
        }

        // 3. Format WhatsApp Web text message
        const message = `🧾 *TAX INVOICE - ${state.company.name}*
━━━━━━━━━━━━━━━━━━━━
*Invoice No:* ${state.invoiceNumber}
*Date:* ${state.invoiceDate}
*Customer:* ${state.customer.name}
*Total Items:* ${items.length}
*Grand Total:* ₹${summary.grandTotal.toLocaleString("en-IN")}
━━━━━━━━━━━━━━━━━━━━
📎 *Attached PDF:* ${generated.filename} (downloaded on your device)
🙏 Thank you for doing business with us!`;

        const encodedText = encodeURIComponent(message);
        const waUrl = rawPhone
            ? `https://web.whatsapp.com/send?phone=${rawPhone}&text=${encodedText}`
            : `https://web.whatsapp.com/send?text=${encodedText}`;

        // 4. Open WhatsApp Web in new tab
        window.open(waUrl, "_blank");

        showToast(`PDF downloaded! WhatsApp Web opened. Attach ${generated.filename} into chat.`, "success");
    } catch (error) {
        console.error("WhatsApp Web share failed:", error);
        showToast("Failed to open WhatsApp Web", "error");
    }
}

// ==========================================================================
// UI Rendering
// ==========================================================================

function render() {
    const app = document.getElementById("app");
    if (!app) return;

    const totals = calculateTotals();
    const selectedCount = Object.keys(state.selectedItems).length;
    const isMobileShareReady = state.supportStatus.supported;

    app.innerHTML = `
    <!-- Top Global Header -->
    <header class="app-header">
      <div class="brand-section">
        <div class="brand-icon-wrapper">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.15c-1.49 0-2.95-.4-4.23-1.16l-.3-.18-3.14.82.84-3.06-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.52 3.68-8.2 8.2-8.2 2.19 0 4.25.85 5.8 2.4 1.55 1.55 2.4 3.61 2.4 5.8 0 4.52-3.68 8.19-8.11 8.19z"/>
          </svg>
        </div>
        <div>
          <h1 class="brand-title">Satya Invoice Hub</h1>
          <div class="brand-subtitle">
            <span>WhatsApp PDF Attachment Share</span>
            <span>•</span>
            <span>Web Share API</span>
          </div>
        </div>
      </div>

      <div class="header-meta">
        <div class="support-pill ${isMobileShareReady ? "supported" : "desktop"}">
          <span style="font-size: 8px;">●</span>
          <span>${isMobileShareReady ? "Native File Share Supported" : "Desktop Browser Mode"}</span>
        </div>

        <nav class="stepper-nav">
          <button class="step-tab ${state.currentStep === "items" ? "active" : ""}" id="tab-step-items">
            <span>1. Select Items (${selectedCount})</span>
          </button>
          <button class="step-tab ${state.currentStep === "preview" ? "active" : ""}" id="tab-step-preview" ${selectedCount === 0 ? "disabled" : ""}>
            <span>2. Invoice Preview & Share</span>
          </button>
        </nav>
      </div>
    </header>

    <!-- Main Container -->
    <main class="app-container">
      ${state.currentStep === "items" ? renderItemsStep(totals) : renderPreviewStep(totals)}
    </main>

    <!-- Fallback Modal for Desktop / Unsupported Browsers -->
    ${state.showFallbackModal ? renderFallbackModal() : ""}
  `;

    attachEventListeners();
}

function renderItemsStep(totals) {
    const filteredProducts = sampleProducts.filter((p) => {
        const matchesSearch = p.name.toLowerCase().includes(state.searchQuery.toLowerCase()) ||
            p.sku.toLowerCase().includes(state.searchQuery.toLowerCase());
        const matchesCat = state.selectedCategory === "All" || p.category === state.selectedCategory;
        return matchesSearch && matchesCat;
    });

    const categories = ["All", ...new Set(sampleProducts.map((p) => p.category))];
    const cartEntries = Object.entries(state.selectedItems);

    return `
    <div class="selection-grid">
      <!-- Left Column: Products Selection Catalog -->
      <section class="panel-card">
        <div class="panel-header">
          <div class="panel-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-2Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
            <span>Product & Fabrics Catalog</span>
          </div>
          <span class="panel-badge">${sampleProducts.length} Items Available</span>
        </div>

        <!-- Catalog Filter Toolbar -->
        <div class="catalog-toolbar">
          <div class="search-input-box">
            <span class="search-icon">🔍</span>
            <input 
              type="text" 
              class="search-input" 
              id="catalog-search" 
              placeholder="Search by item name, SKU..." 
              value="${state.searchQuery}"
            />
          </div>

          <div style="display: flex; gap: 0.35rem; overflow-x: auto; max-width: 100%;">
            ${categories.map((cat) => `
              <button 
                class="step-tab category-btn ${state.selectedCategory === cat ? "active" : ""}" 
                data-category="${cat}"
                style="padding: 0.35rem 0.75rem; font-size: 0.78rem; background: ${state.selectedCategory === cat ? "var(--slate-900)" : "white"}; color: ${state.selectedCategory === cat ? "white" : "var(--slate-700)"}; border: 1px solid var(--slate-200);"
              >
                ${cat}
              </button>
            `).join("")}
          </div>
        </div>

        <!-- Grid of Products -->
        <div class="products-grid">
          ${filteredProducts.map((product) => {
        const isSelected = !!state.selectedItems[product.id];
        const currentQty = isSelected ? state.selectedItems[product.id].qty : 1;

        return `
              <div class="product-card ${isSelected ? "selected" : ""}" data-product-id="${product.id}">
                <div class="product-top">
                  <div class="product-emoji">${product.image}</div>
                  <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <div class="product-sku">${product.sku} • ${product.category}</div>
                    <div class="product-price-row">
                      <span class="product-price">₹${product.price.toLocaleString("en-IN")}</span>
                      <span class="product-gst-badge">GST ${product.gstRate}%</span>
                    </div>
                  </div>
                </div>

                ${isSelected ? `
                  <div class="qty-controller">
                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--slate-600);">Quantity (${product.unit}):</span>
                    <div style="display: flex; align-items: center; gap: 0.4rem;">
                      <button class="qty-btn btn-qty-dec" data-id="${product.id}">−</button>
                      <span class="qty-val">${currentQty}</span>
                      <button class="qty-btn btn-qty-inc" data-id="${product.id}">+</button>
                      <button class="qty-btn btn-remove-item" data-id="${product.id}" title="Remove" style="color: var(--rose-500); margin-left: 0.3rem;">✕</button>
                    </div>
                  </div>
                ` : `
                  <button class="btn-add-item btn-select-product" data-id="${product.id}">
                    <span>+ Add to Invoice</span>
                  </button>
                `}
              </div>
            `;
    }).join("")}
        </div>
      </section>

      <!-- Right Column: Customer Info & Live Bill Summary -->
      <aside class="sidebar-wrapper">
        <!-- Customer Details Box -->
        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
              <span>Customer Details</span>
            </div>
          </div>
          <div style="padding: 1.25rem;">
            <div class="form-group">
              <label class="form-label">Customer Name</label>
              <input type="text" class="form-input" id="cust-name" value="${state.customer.name}" />
            </div>
            <div class="form-group">
              <label class="form-label">WhatsApp / Mobile Number</label>
              <input type="text" class="form-input" id="cust-mobile" value="${state.customer.mobile}" placeholder="+91 98111 22334" />
            </div>
            <div class="form-group">
              <label class="form-label">Address</label>
              <input type="text" class="form-input" id="cust-address" value="${state.customer.address}" />
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
              <div class="form-group">
                <label class="form-label">Invoice No</label>
                <input type="text" class="form-input" id="inv-number" value="${state.invoiceNumber}" />
              </div>
              <div class="form-group">
                <label class="form-label">Invoice Date</label>
                <input type="date" class="form-input" id="inv-date" value="${state.invoiceDate}" />
              </div>
            </div>
          </div>
        </div>

        <!-- Selected Items & Totals Card -->
        <div class="panel-card">
          <div class="panel-header">
            <div class="panel-title">
              <span>Selected Items</span>
            </div>
            <span class="panel-badge">${cartEntries.length} items</span>
          </div>

          <div style="padding: 1.25rem;">
            <div class="cart-items-list">
              ${cartEntries.length === 0 ? `
                <div style="text-align: center; padding: 2rem 1rem; color: var(--slate-400); font-size: 0.85rem;">
                  No items selected yet. Click "+ Add to Invoice" from the catalog.
                </div>
              ` : cartEntries.map(([id, item]) => `
                <div class="cart-item-row">
                  <div>
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-subtitle">${item.qty} × ₹${item.price.toLocaleString("en-IN")} (GST ${item.gstRate}%)</div>
                  </div>
                  <div class="cart-item-price">
                    ₹${((item.qty * item.price) - (item.discount || 0)).toLocaleString("en-IN")}
                  </div>
                </div>
              `).join("")}
            </div>

            <!-- Summary Totals -->
            <div class="summary-row">
              <span>Subtotal</span>
              <span>₹${totals.subtotal.toLocaleString("en-IN")}</span>
            </div>
            ${totals.discountTotal > 0 ? `
              <div class="summary-row" style="color: var(--emerald-600);">
                <span>Discount</span>
                <span>-₹${totals.discountTotal.toLocaleString("en-IN")}</span>
              </div>
            ` : ""}
            <div class="summary-row">
              <span>Tax / GST</span>
              <span>+₹${totals.taxTotal.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
            </div>
            <div class="summary-row total">
              <span>Grand Total</span>
              <span style="color: var(--slate-900);">₹${totals.grandTotal.toLocaleString("en-IN")}</span>
            </div>

            <!-- Action Button to Step 2 -->
            <button 
              class="btn-generate-invoice" 
              id="btn-goto-preview" 
              ${cartEntries.length === 0 ? "disabled" : ""}
            >
              <span>Generate Invoice Preview</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </div>
  `;
}

function renderPreviewStep(totals) {
    const items = Object.values(state.selectedItems);
    const words = numberToWords(totals.grandTotal);

    // Dynamic share button text and spinner
    let shareButtonContent = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.15c-1.49 0-2.95-.4-4.23-1.16l-.3-.18-3.14.82.84-3.06-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.52 3.68-8.2 8.2-8.2 2.19 0 4.25.85 5.8 2.4 1.55 1.55 2.4 3.61 2.4 5.8 0 4.52-3.68 8.19-8.11 8.19z"/>
    </svg>
    <span>Share</span>
  `;

    if (state.shareLoadingState === "preparing") {
        shareButtonContent = `
      <span class="spinner"></span>
      <span>Preparing Invoice...</span>
    `;
    } else if (state.shareLoadingState === "opening") {
        shareButtonContent = `
      <span class="spinner"></span>
      <span>Opening Share...</span>
    `;
    }

    return `
    <div class="preview-container">
      <!-- Top Action Toolbar -->
      <div class="action-toolbar">
        <div class="action-toolbar-left">
          <button class="btn-action btn-secondary" id="btn-back-items">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m15 18-6-6 6-6"/>
            </svg>
            <span>Edit Items</span>
          </button>
          <span style="font-size: 0.825rem; font-weight: 600; color: var(--slate-500);">
            Invoice #${state.invoiceNumber}
          </span>
        </div>

        <div class="action-toolbar-right">
          <!-- 1. Download PDF Button -->
          <button class="btn-action btn-download" id="btn-download-pdf">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Download PDF</span>
          </button>

          <!-- 2. REQUIRED SHARE BUTTON (Native Web Share API for Mobile) -->
          <button 
            class="btn-action btn-share-whatsapp ${state.shareLoadingState ? "loading" : ""}" 
            id="btn-share-pdf"
            ${state.shareLoadingState ? "disabled" : ""}
            title="Share PDF file attachment via native Mobile Share Sheet"
          >
            ${shareButtonContent}
          </button>

          <!-- 3. WhatsApp Web Button (Direct Desktop / PC WhatsApp Web) -->
          <button class="btn-action btn-whatsapp-web" id="btn-share-whatsapp-web" title="Open and share via WhatsApp Web with downloaded PDF">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.15c-1.49 0-2.95-.4-4.23-1.16l-.3-.18-3.14.82.84-3.06-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.52 3.68-8.2 8.2-8.2 2.19 0 4.25.85 5.8 2.4 1.55 1.55 2.4 3.61 2.4 5.8 0 4.52-3.68 8.19-8.11 8.19z"/>
            </svg>
            <span>WhatsApp Web</span>
          </button>

          <!-- 4. Print Button -->
          <button class="btn-action btn-print" id="btn-print-invoice">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>
            </svg>
            <span>Print</span>
          </button>
        </div>
      </div>

      <!-- Real GST Invoice Document Sheet -->
      <article class="invoice-sheet" id="printable-invoice">
        <!-- Company Header Row -->
        <div class="invoice-header-row">
          <div>
            <h2 class="invoice-company-name">${state.company.name}</h2>
            <div class="invoice-company-details">
              <div>${state.company.tagline}</div>
              <div><strong>GSTIN:</strong> ${state.company.gstin} | <strong>PAN:</strong> ${state.company.pan}</div>
              <div>${state.company.address}, ${state.company.city}</div>
              <div>Phone: ${state.company.phone} | Email: ${state.company.email}</div>
            </div>
          </div>
          <div class="invoice-title-block">
            <div class="tax-invoice-badge">TAX INVOICE</div>
            <div class="invoice-number-display">${state.invoiceNumber}</div>
            <div class="invoice-date-display">Date: ${state.invoiceDate}</div>
          </div>
        </div>

        <!-- Bill To / Invoice Meta Grid -->
        <div class="invoice-meta-grid">
          <div>
            <div class="meta-block-label">Bill To (Customer Details):</div>
            <div class="meta-customer-name">${state.customer.name}</div>
            <div class="meta-customer-text">Mobile: ${state.customer.mobile}</div>
            <div class="meta-customer-text">${state.customer.address}</div>
            <div class="meta-customer-text">${state.customer.city}</div>
          </div>
          <div style="text-align: right;">
            <div class="meta-block-label">Invoice Specifics:</div>
            <div class="meta-customer-text"><strong>Place of Supply:</strong> ${state.customer.state}</div>
            <div class="meta-customer-text"><strong>Payment Mode:</strong> Cash / UPI</div>
            <div class="meta-customer-text"><strong>Reverse Charge:</strong> No</div>
          </div>
        </div>

        <!-- Invoice Table of Selected Items -->
        <div class="invoice-table-wrapper">
          <table class="invoice-table">
            <thead>
              <tr>
                <th class="text-center" style="width: 40px;">#</th>
                <th>Item Description</th>
                <th class="text-center">Qty</th>
                <th class="text-right">Rate (₹)</th>
                <th class="text-right">Discount</th>
                <th class="text-center">GST %</th>
                <th class="text-right">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item, index) => {
        const rate = Number(item.price || 0);
        const qty = Number(item.qty || 1);
        const disc = Number(item.discount || 0);
        const taxable = (rate * qty) - disc;
        const gstRate = Number(item.gstRate || 5);
        const gstAmount = (taxable * gstRate) / 100;
        const lineTotal = taxable + gstAmount;

        return `
                  <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>
                      <strong>${item.name}</strong>
                      <div style="font-size: 0.725rem; color: var(--slate-500);">${item.sku}</div>
                    </td>
                    <td class="text-center">${qty} ${item.unit}</td>
                    <td class="text-right">₹${rate.toLocaleString("en-IN")}</td>
                    <td class="text-right">${disc > 0 ? `₹${disc}` : "-"}</td>
                    <td class="text-center">${gstRate}%</td>
                    <td class="text-right"><strong>₹${lineTotal.toFixed(2)}</strong></td>
                  </tr>
                `;
    }).join("")}
            </tbody>
          </table>
        </div>

        <!-- Invoice Bottom Calculations & Terms -->
        <div class="invoice-bottom-grid">
          <div>
            <div class="words-block">
              <div class="words-label">Amount in Words:</div>
              <div class="words-text">${words}</div>
            </div>

            <div class="terms-text">
              <strong>Terms & Conditions:</strong><br />
              ${state.company.terms}
            </div>
          </div>

          <div>
            <div class="calc-breakdown">
              <div class="calc-row">
                <span>Subtotal:</span>
                <span>₹${totals.subtotal.toLocaleString("en-IN")}</span>
              </div>
              ${totals.discountTotal > 0 ? `
                <div class="calc-row" style="color: var(--emerald-600);">
                  <span>Total Discount:</span>
                  <span>-₹${totals.discountTotal.toLocaleString("en-IN")}</span>
                </div>
              ` : ""}
              <div class="calc-row">
                <span>CGST:</span>
                <span>₹${totals.cgst.toFixed(2)}</span>
              </div>
              <div class="calc-row">
                <span>SGST:</span>
                <span>₹${totals.sgst.toFixed(2)}</span>
              </div>
              <div class="calc-row grand-total">
                <span>Grand Total:</span>
                <span>₹${totals.grandTotal.toLocaleString("en-IN")}</span>
              </div>
            </div>

            <div class="signatory-box">
              <div>For <strong>${state.company.name}</strong></div>
              <div class="sign-line">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </article>

      <!-- Requirement 19: Protected Backend Endpoint Integration Box -->
      <section class="backend-card">
        <div class="backend-card-header">
          <div class="backend-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>
            </svg>
            <span>Requirement 19: Protected Backend PDF URL Solution</span>
          </div>
          <span class="backend-badge">JWT / Bearer Auth Ready</span>
        </div>
        <p style="font-size: 0.8rem; color: var(--slate-600);">
          Agar aapka PDF backend authenticated API se generate ho kar aa raha hai, to <code>fetchPdfFromProtectedBackend()</code> helper function Bearer token aur <code>credentials: 'include'</code> ke saath PDF fetch karta hai:
        </p>
        <div class="code-snippet">
// Backend Protected PDF Fetch Implementation:
const response = await fetch('/api/v1/invoices/' + invoiceId + '/pdf', {
  method: 'GET',
  headers: {
    'Accept': 'application/pdf',
    'Authorization': 'Bearer ' + authToken
  },
  credentials: 'include' // include cookies/session
});
const blob = await response.blob();
const file = new File([blob], 'invoice.pdf', { type: 'application/pdf' });
// Then pass file to navigator.share({ files: [file] })
        </div>
      </section>
    </div>
  `;
}

function renderFallbackModal() {
    return `
    <div class="modal-overlay" id="fallback-modal-overlay">
      <div class="modal-content">
        <div class="modal-icon-badge">📱</div>
        <h3 class="modal-title">Mobile Feature Detected</h3>
        <p class="modal-desc">
          Web Share API direct PDF <strong>file attachments</strong> are natively supported on mobile devices (Android Chrome, Samsung Internet, iOS Safari).
        </p>

        <div class="modal-info-box">
          <div style="font-weight: 700; margin-bottom: 0.35rem; color: var(--slate-900);">Browser Status:</div>
          <div>${state.fallbackReason || "Current desktop browser does not support native direct file attachment sharing."}</div>
          <div style="margin-top: 0.6rem; color: var(--slate-600); font-size: 0.775rem;">
            💡 <strong>Mobile Test:</strong> Open this web app on your Android Phone Chrome browser to see the Native Share Sheet with WhatsApp file attachment immediately!
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-action btn-secondary" id="btn-close-modal">Dismiss</button>
          <button class="btn-action btn-whatsapp-web" id="btn-modal-wa-web">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm0 18.15c-1.49 0-2.95-.4-4.23-1.16l-.3-.18-3.14.82.84-3.06-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.52 3.68-8.2 8.2-8.2 2.19 0 4.25.85 5.8 2.4 1.55 1.55 2.4 3.61 2.4 5.8 0 4.52-3.68 8.19-8.11 8.19z"/>
            </svg>
            <span>Open WhatsApp Web</span>
          </button>
          <button class="btn-action btn-download" id="btn-modal-download">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// ==========================================================================
// Event Listeners & Interactive Handlers
// ==========================================================================
function attachEventListeners() {
    // Navigation Tabs
    const tabItems = document.getElementById("tab-step-items");
    if (tabItems) {
        tabItems.onclick = () => {
            state.currentStep = "items";
            render();
        };
    }

    const tabPreview = document.getElementById("tab-step-preview");
    if (tabPreview) {
        tabPreview.onclick = () => {
            if (Object.keys(state.selectedItems).length > 0) {
                state.currentStep = "preview";
                render();
            }
        };
    }

    const btnGotoPreview = document.getElementById("btn-goto-preview");
    if (btnGotoPreview) {
        btnGotoPreview.onclick = () => {
            state.currentStep = "preview";
            render();
        };
    }

    const btnBackItems = document.getElementById("btn-back-items");
    if (btnBackItems) {
        btnBackItems.onclick = () => {
            state.currentStep = "items";
            render();
        };
    }

    // Catalog Search
    const searchInput = document.getElementById("catalog-search");
    if (searchInput) {
        searchInput.oninput = (e) => {
            state.searchQuery = e.target.value;
            render();
            const el = document.getElementById("catalog-search");
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
            }
        };
    }

    // Category buttons
    document.querySelectorAll(".category-btn").forEach((btn) => {
        btn.onclick = () => {
            state.selectedCategory = btn.getAttribute("data-category");
            render();
        };
    });

    // Add Item to selection
    document.querySelectorAll(".btn-select-product").forEach((btn) => {
        btn.onclick = () => {
            const id = btn.getAttribute("data-id");
            const prod = sampleProducts.find((p) => p.id === id);
            if (prod) {
                state.selectedItems[id] = { ...prod, qty: 1, discount: 0 };
                render();
            }
        };
    });

    // Quantity controllers
    document.querySelectorAll(".btn-qty-inc").forEach((btn) => {
        btn.onclick = () => {
            const id = btn.getAttribute("data-id");
            if (state.selectedItems[id]) {
                state.selectedItems[id].qty += 1;
                render();
            }
        };
    });

    document.querySelectorAll(".btn-qty-dec").forEach((btn) => {
        btn.onclick = () => {
            const id = btn.getAttribute("data-id");
            if (state.selectedItems[id]) {
                if (state.selectedItems[id].qty > 1) {
                    state.selectedItems[id].qty -= 1;
                } else {
                    delete state.selectedItems[id];
                }
                render();
            }
        };
    });

    document.querySelectorAll(".btn-remove-item").forEach((btn) => {
        btn.onclick = () => {
            const id = btn.getAttribute("data-id");
            delete state.selectedItems[id];
            render();
        };
    });

    // Customer form inputs
    const custName = document.getElementById("cust-name");
    if (custName) {
        custName.onchange = (e) => { state.customer.name = e.target.value; };
    }
    const custMobile = document.getElementById("cust-mobile");
    if (custMobile) {
        custMobile.onchange = (e) => { state.customer.mobile = e.target.value; };
    }
    const custAddress = document.getElementById("cust-address");
    if (custAddress) {
        custAddress.onchange = (e) => { state.customer.address = e.target.value; };
    }
    const invNumber = document.getElementById("inv-number");
    if (invNumber) {
        invNumber.onchange = (e) => { state.invoiceNumber = e.target.value; };
    }
    const invDate = document.getElementById("inv-date");
    if (invDate) {
        invDate.onchange = (e) => { state.invoiceDate = e.target.value; };
    }

    // Invoice Actions: Share, Download, Print, WhatsApp Web
    const btnSharePdf = document.getElementById("btn-share-pdf");
    if (btnSharePdf) {
        btnSharePdf.onclick = handleShareInvoice;
    }

    const btnShareWaWeb = document.getElementById("btn-share-whatsapp-web");
    if (btnShareWaWeb) {
        btnShareWaWeb.onclick = handleShareWhatsAppWeb;
    }

    const btnDownloadPdf = document.getElementById("btn-download-pdf");
    if (btnDownloadPdf) {
        btnDownloadPdf.onclick = handleDownloadPdf;
    }

    const btnPrintInvoice = document.getElementById("btn-print-invoice");
    if (btnPrintInvoice) {
        btnPrintInvoice.onclick = handlePrint;
    }

    // Fallback modal handlers
    const btnCloseModal = document.getElementById("btn-close-modal");
    if (btnCloseModal) {
        btnCloseModal.onclick = () => {
            state.showFallbackModal = false;
            render();
        };
    }

    const btnModalWaWeb = document.getElementById("btn-modal-wa-web");
    if (btnModalWaWeb) {
        btnModalWaWeb.onclick = () => {
            state.showFallbackModal = false;
            render();
            handleShareWhatsAppWeb();
        };
    }

    const btnModalDownload = document.getElementById("btn-modal-download");
    if (btnModalDownload) {
        btnModalDownload.onclick = () => {
            state.showFallbackModal = false;
            handleDownloadPdf();
        };
    }

    const modalOverlay = document.getElementById("fallback-modal-overlay");
    if (modalOverlay) {
        modalOverlay.onclick = (e) => {
            if (e.target === modalOverlay) {
                state.showFallbackModal = false;
                render();
            }
        };
    }
}

// Initial Boot
render();
