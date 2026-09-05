package com.gitlabops.util;

/**
 * Utility for encoding/decoding federated GitLab identifiers across
 * multiple GitLab instances.
 *
 * <p>Each GitLab instance is assigned an index (0-based). IDs are
 * encoded as (instanceIndex << 44) | localId, keeping the combined
 * value within a 64-bit signed long for all practical instance and
 * local ID ranges.</p>
 *
 * <p>This matches the encoding used in the legacy Rust codebase
 * (federated_gitlab.rs). Instance 0 is the local/default GitLab
 * installation and uses the raw local ID without encoding.</p>
 */
public final class FederatedIdUtility {

    private FederatedIdUtility() {}

    /** Number of bits shifted for the instance/index portion. */
    public static final int INSTANCE_SHIFT_BITS = 44;

    /** 1 << 44 = 17592186044416 */
    public static final long INSTANCE_SHIFT = 1L << INSTANCE_SHIFT_BITS;

    /** Mask keeping the lower 44 bits: (1 << 44) - 1 = 0xFFFFFFFFFFFF */
    public static final long LOCAL_ID_MASK = INSTANCE_SHIFT - 1;

    /**
     * Encode an (instanceIndex, localId) pair into a single long.
     *
     * <p>For instanceIndex 0 the result is simply localId.</p>
     */
    public static long encode(long namespaceId, long localId) {
        return (namespaceId << INSTANCE_SHIFT_BITS) | (localId & LOCAL_ID_MASK);
    }

    /**
     * Decode a federated ID back into {namespaceId, localId}.
     *
     * <p>Uses unsigned right shift (>>>) so that the namespace portion
     * is correctly extracted even if the high bit of federatedId is set.</p>
     */
    public static long[] decode(long federatedId) {
        long namespaceId = federatedId >>> INSTANCE_SHIFT_BITS;
        long localId = federatedId & LOCAL_ID_MASK;
        return new long[]{namespaceId, localId};
    }

    /**
     * Decode a federated ID into a named record.
     */
    public record DecodedId(long namespaceId, long localId) {
        /**
         * Create a DecodedId from a federated ID.
         */
        public static DecodedId from(long federatedId) {
            long namespaceId = federatedId >>> INSTANCE_SHIFT_BITS;
            long localId = federatedId & LOCAL_ID_MASK;
            return new DecodedId(namespaceId, localId);
        }
    }
}
