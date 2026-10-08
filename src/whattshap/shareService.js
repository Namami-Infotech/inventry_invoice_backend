/**
 * Service to handle Web Share API and PDF file sharing to WhatsApp / native share sheet.
 */

export const ShareStatus = {
    IDLE: "idle",
    PREPARING: "preparing",
    OPENING: "opening",
    SUCCESS: "success",
    CANCELLED: "cancelled",
    ERROR: "error",
    UNSUPPORTED: "unsupported"
};

/**
 * Detects whether the current device/browser supports Web Share API with File attachments.
 */
export function checkFileShareSupport(testFile = null) {
    if (typeof navigator === "undefined" || !navigator.share) {
        return {
            supported: false,
            reason: "Web Share API (`navigator.share`) is not available in this browser."
        };
    }

    if (!navigator.canShare) {
        return {
            supported: false,
            reason: "`navigator.canShare` is not supported in this browser."
        };
    }

    // Create dummy test file if none provided
    const dummyFile = testFile || new File(["test"], "test.pdf", { type: "application/pdf" });

    try {
        const canShareFiles = navigator.canShare({ files: [dummyFile] });
        if (!canShareFiles) {
            return {
                supported: false,
                reason: "This browser supports text sharing, but does NOT support direct File/PDF sharing."
            };
        }
        return { supported: true, reason: "" };
    } catch (err) {
        return {
            supported: false,
            reason: err.message || "Failed to check file share capability."
        };
    }
}

/**
 * Share invoice PDF file via Native Share Sheet (WhatsApp, etc.).
 * 
 * @param {Object} params
 * @param {File} params.file - Actual File object
 * @param {string} params.title - Share title
 * @param {string} [params.text] - Optional share text (NO PDF URL as per requirement)
 * @param {Function} [params.onStatusChange] - Status listener
 * @returns {Promise<{ success: boolean, cancelled?: boolean, error?: string }>}
 */
export async function shareInvoiceFile({ file, title = "Tax Invoice", text = "Please find the attached invoice.", onStatusChange = () => { } }) {
    if (!file || !(file instanceof File)) {
        throw new Error("A valid File object is required for file sharing.");
    }

    // 1. Check capability
    const support = checkFileShareSupport(file);
    if (!support.supported) {
        onStatusChange(ShareStatus.UNSUPPORTED);
        return {
            success: false,
            unsupported: true,
            reason: support.reason
        };
    }

    // 2. Opening Share Sheet
    onStatusChange(ShareStatus.OPENING);

    try {
        // Invoke Native Share Sheet with files array
        // WhatsApp receives this as an actual file attachment!
        await navigator.share({
            title: title,
            text: text, // No URL added here
            files: [file]
        });

        onStatusChange(ShareStatus.SUCCESS);
        return { success: true };
    } catch (error) {
        // 3. User cancelled the share dialog
        if (error.name === "AbortError") {
            console.log("User cancelled share dialog.");
            onStatusChange(ShareStatus.CANCELLED);
            return { success: false, cancelled: true };
        }

        // Permission denied or other share error
        console.error("Web Share API error:", error);
        onStatusChange(ShareStatus.ERROR);
        return {
            success: false,
            error: error.message || "Failed to open native share sheet"
        };
    } finally {
        // Short delay then reset
        setTimeout(() => {
            onStatusChange(ShareStatus.IDLE);
        }, 1200);
    }
}
