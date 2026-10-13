package com.relay.file.service;

import com.relay.common.exception.ApiException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Slf4j
@Service
public class FileStorageService {

    private final Path fileStorageLocation;

    /**
     * SECURITY FIX (§5): SVG removed from the allowed MIME-type list.
     *
     * SVG is XML that can embed {@code <script>} tags, {@code on*} event handlers, and
     * {@code <foreignObject>} elements.  When served with Content-Disposition: inline (or
     * navigated to directly via the "Open Original" link in ImageLightbox) it executes as
     * a same-origin document and can exfiltrate access tokens / E2EE private keys from
     * localStorage / IndexedDB.
     *
     * If SVG upload is required in the future, sanitise server-side with a library such as
     * OWASP Java HTML Sanitizer or svg-sanitizer (stripping script, on* attrs, foreignObject)
     * before storing.  Do not re-add svg+xml here until that sanitisation is in place.
     */
    static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            // Images
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            // Videos
            "video/mp4",
            "video/webm",
            "video/quicktime",
            "video/x-msvideo",
            // Documents
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "text/plain",
            "text/csv",
            // Archives
            "application/zip",
            "application/vnd.rar",
            "application/x-7z-compressed",
            "application/x-tar",
            "application/gzip",
            // Android APK
            "application/vnd.android.package-archive",
            // E2EE encrypted blobs — all user files are encrypted client-side and uploaded as .enc
            "application/octet-stream"
    );

    /**
     * SECURITY FIX (§5): .svg extension removed (XSS risk — see above).
     * All other common extensions are allowed because user uploads are E2EE-encrypted
     * and stored as opaque .enc blobs — the server never interprets the content.
     */
    static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            // Images
            ".jpg", ".jpeg", ".png", ".gif", ".webp",
            // Videos
            ".mp4", ".webm", ".mov", ".avi",
            // Documents
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv",
            // Archives
            ".zip", ".rar", ".7z", ".tar", ".gz",
            // Android
            ".apk",
            // E2EE encrypted files
            ".enc"
    );

    /**
     * SECURITY FIX (§5): Magic-byte signatures for each MIME type we accept.
     *
     * Even with an extension and Content-Type whitelist, a client can upload a valid
     * JPEG/PNG file header followed by SVG/HTML payload, or lie about Content-Type
     * entirely.  Checking the actual first bytes of the stream prevents the declared
     * type from being spoofed to bypass the allow-list.
     *
     * Format: MIME type → array of possible magic-byte prefixes (each as a byte[]).
     * .enc files carry arbitrary binary (IV + AES-GCM ciphertext) — no fixed magic.
     */
    private static final Map<String, byte[][]> MAGIC_BYTES = Map.of(
            "image/jpeg", new byte[][] {
                    new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF}
            },
            "image/png", new byte[][] {
                    new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
            },
            "image/gif", new byte[][] {
                    "GIF87a".getBytes(),
                    "GIF89a".getBytes()
            },
            "image/webp", new byte[][] {
                    "RIFF".getBytes()   // bytes 0-3; bytes 8-11 are "WEBP" but 4-byte check is enough to reject non-RIFF
            }
            // application/octet-stream (.enc) intentionally omitted — no fixed magic
    );

    public FileStorageService() {
        this.fileStorageLocation = Paths.get("./uploads").toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.fileStorageLocation);
        } catch (Exception ex) {
            throw new RuntimeException(
                    "Could not create the directory where the uploaded files will be stored.", ex);
        }
    }

    public String storeFile(MultipartFile file) {
        String originalFilename = StringUtils.cleanPath(
                Objects.requireNonNull(file.getOriginalFilename()));

        // Prevent path traversal in the original filename.
        if (originalFilename.contains("..") ||
                originalFilename.contains("/") ||
                originalFilename.contains("\\")) {
            throw ApiException.badRequest("Invalid filename: " + originalFilename);
        }

        // Extract and validate extension.
        String extension = "";
        String fullExtension = "";
        int dotIndex = originalFilename.lastIndexOf('.');
        if (dotIndex >= 0) {
            extension = originalFilename.substring(dotIndex).toLowerCase();
            fullExtension = extension;
            if (".enc".equals(extension)) {
                // Check if there is a preceding base extension, e.g. .png in photo.png.enc
                int secondDot = originalFilename.lastIndexOf('.', dotIndex - 1);
                if (secondDot >= 0) {
                    String baseExt = originalFilename.substring(secondDot, dotIndex).toLowerCase();
                    if (ALLOWED_EXTENSIONS.contains(baseExt)) {
                        fullExtension = baseExt + ".enc";
                    }
                }
            }
        }
        if (!extension.isEmpty() && !ALLOWED_EXTENSIONS.contains(extension)) {
            throw ApiException.badRequest("File type not allowed: " + extension);
        }

        // Validate declared MIME type.
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase())) {
            throw ApiException.badRequest("Content type not allowed: " + contentType);
        }

        // SECURITY FIX (§5): Magic-byte verification — confirm the actual file bytes
        // match the claimed MIME type.  This stops a client from uploading an SVG (or
        // HTML, JS, etc.) with a renamed extension and lying about Content-Type.
        verifyMagicBytes(file, contentType.toLowerCase());

        // Validate file size (defense-in-depth; Spring multipart config also enforces 25 MB).
        if (file.getSize() > 25L * 1024 * 1024) {
            throw ApiException.badRequest("File too large. Maximum size is 25MB.");
        }

        // Generate a random filename to prevent any filename-based attacks.
        String storedFileName = UUID.randomUUID() + fullExtension;

        try {
            Path targetLocation = this.fileStorageLocation.resolve(storedFileName).normalize();

            // Explicit directory-confinement check (defence against normalisation tricks).
            if (!targetLocation.startsWith(this.fileStorageLocation)) {
                throw ApiException.forbidden("Access denied: path traversal detected");
            }

            Files.copy(file.getInputStream(), targetLocation, StandardCopyOption.REPLACE_EXISTING);
            log.info("File stored: {} (original: {}, size: {} bytes, type: {})",
                    storedFileName, originalFilename, file.getSize(), contentType);

            return storedFileName;
        } catch (IOException ex) {
            throw ApiException.internalServerError("Could not store file. Please try again.");
        }
    }

    public String storeAvatar(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Profile picture file cannot be empty");
        }
        if (file.getSize() > 2L * 1024 * 1024) {
            throw ApiException.badRequest("Profile picture exceeds 2MB limit. Please choose a smaller image.");
        }
        String contentType = file.getContentType();
        if (contentType == null || !Set.of("image/jpeg", "image/png", "image/webp", "image/gif").contains(contentType.toLowerCase())) {
            throw ApiException.badRequest("Unsupported image format. Allowed formats: JPEG, PNG, WebP, GIF.");
        }
        return storeFile(file);
    }

    public Resource loadFileAsResource(String fileName) {
        // Reject path traversal attempts in the requested filename.
        if (fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw ApiException.forbidden("Access denied: invalid filename");
        }

        try {
            Path filePath = this.fileStorageLocation.resolve(fileName).normalize();

            if (!filePath.startsWith(this.fileStorageLocation)) {
                throw ApiException.forbidden("Access denied: path traversal detected");
            }

            Resource resource = new UrlResource(filePath.toUri());
            if (resource.exists()) {
                return resource;
            } else {
                throw ApiException.notFound("File", fileName);
            }
        } catch (MalformedURLException ex) {
            throw ApiException.notFound("File", fileName);
        }
    }

    // ── Magic-byte verification ───────────────────────────────────────────────

    /**
     * SECURITY FIX (§5): Reads the first bytes of the upload and checks them against
     * the expected magic numbers for the declared MIME type.
     *
     * Skipped for {@code application/octet-stream} (.enc) because those files contain
     * arbitrary binary (IV prepended to AES-GCM ciphertext) with no fixed signature.
     */
    private void verifyMagicBytes(MultipartFile file, String mimeType) {
        byte[][] signatures = MAGIC_BYTES.get(mimeType);
        if (signatures == null) {
            // No magic-byte rule for this type (e.g. application/octet-stream) — skip.
            return;
        }

        // Read just enough bytes for the longest signature we need to check.
        int maxSignatureLen = 0;
        for (byte[] sig : signatures) {
            if (sig.length > maxSignatureLen) maxSignatureLen = sig.length;
        }

        byte[] header = new byte[maxSignatureLen];
        int bytesRead;
        try (InputStream is = file.getInputStream()) {
            bytesRead = is.read(header, 0, maxSignatureLen);
        } catch (IOException ex) {
            throw ApiException.badRequest("Could not read file content for validation.");
        }

        for (byte[] sig : signatures) {
            if (bytesRead >= sig.length && startsWith(header, sig)) {
                return; // Signature matched — file is what it claims to be.
            }
        }

        log.warn("Magic-byte mismatch for declared MIME type '{}': first bytes do not match any known signature", mimeType);
        throw ApiException.badRequest(
                "File content does not match the declared file type. Upload rejected.");
    }

    private static boolean startsWith(byte[] data, byte[] prefix) {
        for (int i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }
}
