package com.relay.file.dto;

public record FileUploadResponse(
        String fileName,
        String fileUrl,
        String contentType,
        long size
) {}
