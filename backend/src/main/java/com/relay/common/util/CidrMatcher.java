package com.relay.common.util;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Minimal CIDR-range membership check used by {@link com.relay.common.config.RateLimitFilter}.
 *
 * SECURITY FIX (§2): Replaces the former string-prefix check for trusted proxies.
 * Prefix matching ("10.0." starts-with) is both fragile and bypassable; proper
 * CIDR arithmetic is used here instead.
 *
 * Supports both IPv4 and IPv6.  Does NOT depend on commons-net so there is no new
 * compile-time dependency.
 */
public final class CidrMatcher {

    private final List<CidrRange> ranges;

    private CidrMatcher(List<CidrRange> ranges) {
        this.ranges = Collections.unmodifiableList(ranges);
    }

    /**
     * Builds a matcher from a comma-separated list of CIDR strings.
     * An empty or blank input produces a matcher that never matches.
     *
     * @param cidrList e.g. {@code "10.0.0.0/8, 172.16.0.0/12, ::1/128"}
     */
    public static CidrMatcher of(String cidrList) {
        if (cidrList == null || cidrList.isBlank()) {
            return new CidrMatcher(List.of());
        }
        List<CidrRange> result = new ArrayList<>();
        for (String entry : cidrList.split(",")) {
            String trimmed = entry.trim();
            if (!trimmed.isEmpty()) {
                result.add(CidrRange.parse(trimmed));
            }
        }
        return new CidrMatcher(result);
    }

    /** Returns {@code true} if {@code ipAddress} falls within any configured CIDR range. */
    public boolean matches(String ipAddress) {
        if (ipAddress == null || ipAddress.isBlank()) {
            return false;
        }
        try {
            InetAddress addr = InetAddress.getByName(stripZoneId(ipAddress));
            for (CidrRange range : ranges) {
                if (range.contains(addr)) {
                    return true;
                }
            }
        } catch (UnknownHostException ignored) {
            // Malformed address — treat as non-matching rather than crashing.
        }
        return false;
    }

    /** IPv6 addresses from Servlet containers can carry a zone-id suffix like "%0" — strip it. */
    private static String stripZoneId(String ip) {
        int pct = ip.indexOf('%');
        return pct >= 0 ? ip.substring(0, pct) : ip;
    }

    // ── Inner helper ─────────────────────────────────────────────────────────

    private static final class CidrRange {

        private final byte[] networkAddress;
        private final int    prefixLength;

        private CidrRange(byte[] networkAddress, int prefixLength) {
            this.networkAddress = networkAddress;
            this.prefixLength   = prefixLength;
        }

        static CidrRange parse(String cidr) {
            int slash = cidr.lastIndexOf('/');
            if (slash < 0) {
                // No prefix — treat as /32 (IPv4) or /128 (IPv6) i.e. exact match.
                try {
                    byte[] addr = InetAddress.getByName(cidr).getAddress();
                    return new CidrRange(addr, addr.length * 8);
                } catch (UnknownHostException e) {
                    throw new IllegalArgumentException("Invalid CIDR entry: " + cidr, e);
                }
            }
            String ipPart     = cidr.substring(0, slash);
            int    prefix     = Integer.parseInt(cidr.substring(slash + 1));
            try {
                byte[] addr = InetAddress.getByName(ipPart).getAddress();
                int maxBits = addr.length * 8;
                if (prefix < 0 || prefix > maxBits) {
                    throw new IllegalArgumentException("Prefix length out of range in: " + cidr);
                }
                return new CidrRange(maskAddress(addr, prefix), prefix);
            } catch (UnknownHostException e) {
                throw new IllegalArgumentException("Invalid CIDR entry: " + cidr, e);
            }
        }

        /** Zero out the host bits so we always compare against the network address. */
        private static byte[] maskAddress(byte[] addr, int prefixLen) {
            byte[] masked = addr.clone();
            for (int bit = prefixLen; bit < masked.length * 8; bit++) {
                int byteIdx  = bit / 8;
                int bitIdx   = 7 - (bit % 8);
                masked[byteIdx] &= (byte) ~(1 << bitIdx);
            }
            return masked;
        }

        boolean contains(InetAddress candidate) {
            byte[] addrBytes = candidate.getAddress();
            if (addrBytes.length != networkAddress.length) {
                return false; // IPv4 vs IPv6 mismatch
            }
            byte[] maskedCandidate = maskAddress(addrBytes, prefixLength);
            for (int i = 0; i < networkAddress.length; i++) {
                if (maskedCandidate[i] != networkAddress[i]) {
                    return false;
                }
            }
            return true;
        }
    }
}
