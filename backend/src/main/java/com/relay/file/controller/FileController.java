package com.relay.file.controller;

import com.relay.file.dto.FileUploadResponse;
import com.relay.file.service.FileStorageService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.io.IOException;
import java.util.Set;

@Slf4j
@RestController
@RequestMapping("/api/v1/files")
@RequiredArgsConstructor
public class FileController {

    private final FileStorageService fileStorageService;

    /**
     * SECURITY FIX (§5): Explicit allow-list of MIME types that are safe to serve
     * inline (i.e. rendered directly in the browser without navigating away).
     *
     * Anything NOT in this list is served with Content-Disposition: attachment, which
     * forces a download and prevents the browser from executing any embedded content.
     *
     * SVG is intentionally absent — it can contain {@code <script>} tags and would
     * execute as a same-origin document if served inline, allowing exfiltration of
     * tokens / E2EE keys.
     *
     * .enc (application/octet-stream) files are fetched by the JavaScript client via
     * fetch() + decrypted in-memory — they are never navigated to directly.  Serving
     * them as attachment is correct and safe.
     */
    private static final Set<String> INLINE_SAFE_MIME_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/gif",
            "image/webp",
            "video/mp4",
            "video/webm",
            "video/quicktime"
    );

    @PostMapping("/upload")
    public ResponseEntity<FileUploadResponse> uploadFile(@RequestParam("file") MultipartFile file) {
        String fileName = fileStorageService.storeFile(file);

        String fileUrl = "/api/v1/files/" + fileName;

        return ResponseEntity.ok(new FileUploadResponse(
                fileName,
                fileUrl,
                file.getContentType(),
                file.getSize()
        ));
    }

    @GetMapping("/{fileName:.+}")
    public ResponseEntity<Resource> downloadFile(
            @PathVariable String fileName,
            HttpServletRequest request) {

        Resource resource = fileStorageService.loadFileAsResource(fileName);

        String contentType = null;
        try {
            contentType = request.getServletContext()
                    .getMimeType(resource.getFile().getAbsolutePath());
        } catch (IOException ex) {
            log.info("Could not determine file type for '{}' — defaulting to octet-stream", fileName);
        }
        if (contentType == null) {
            contentType = "application/octet-stream";
        }

        // SECURITY FIX (§5): Only serve Content-Disposition: inline for image types we
        // know are safe to render.  All other content (including any type not in the
        // allow-list) is served as attachment, forcing a download rather than in-browser
        // execution.  This closes the same-origin XSS path where an SVG or HTML file
        // would have executed as a first-party document and could exfiltrate tokens.
        String disposition = INLINE_SAFE_MIME_TYPES.contains(contentType.toLowerCase())
                ? "inline"
                : "attachment";

        String safeFilename = resource.getFilename() != null
                ? resource.getFilename().replaceAll("[^a-zA-Z0-9._-]", "_")
                : "download";

        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        disposition + "; filename=\"" + safeFilename + "\"")
                .body(resource);
    }
}
