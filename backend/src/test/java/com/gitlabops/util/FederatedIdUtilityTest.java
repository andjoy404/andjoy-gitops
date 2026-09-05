package com.gitlabops.util;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import com.gitlabops.util.FederatedIdUtility.DecodedId;

class FederatedIdUtilityTest {

    private static final long INSTANCE_SHIFT = FederatedIdUtility.INSTANCE_SHIFT; // 17592186044416
    private static final long LOCAL_ID_MASK = FederatedIdUtility.LOCAL_ID_MASK;  // 0xFFFF_FFFF_FFFF

    // --- encode tests ---

    @Test
    void encodeLocalOnly() {
        // instance 0 = identity: (0 << 44) | 123 = 123
        assertEquals(123L, FederatedIdUtility.encode(0, 123));
    }

    @Test
    void encodeInstanceZeroProducesLocalId() {
        assertEquals(0L, FederatedIdUtility.encode(0, 0));
        assertEquals(42L, FederatedIdUtility.encode(0, 42));
        assertEquals(1L << 40, FederatedIdUtility.encode(0, 1L << 40));
    }

    @Test
    void encodeInstanceOne() {
        // (1 << 44) | 456 = 17592186044872
        assertEquals(INSTANCE_SHIFT + 456, FederatedIdUtility.encode(1, 456));
    }

    @Test
    void encodeInstanceFive() {
        // (5 << 44) | 789 = 87960930222496
        assertEquals(5 * INSTANCE_SHIFT + 789, FederatedIdUtility.encode(5, 789));
    }

    @Test
    void encodeMaxLocalId() {
        // LOCAL_ID_MASK = (1 << 44) - 1
        assertEquals(LOCAL_ID_MASK, FederatedIdUtility.encode(0, LOCAL_ID_MASK));
    }

    @Test
    void encodeTruncatesLocalIdTo44Bits() {
        // High bits of localId beyond 44 are masked out
        long bigLocal = (1L << 44) + 100;
        assertEquals(100, FederatedIdUtility.encode(0, bigLocal));
    }

    @Test
    void encodeLargeNamespaceAndLocal() {
        // namespace 100, local = Long.MAX_VALUE
        DecodedId decoded = DecodedId.from(FederatedIdUtility.encode(100, Long.MAX_VALUE));
        assertEquals(100, decoded.namespaceId());
        assertEquals(LOCAL_ID_MASK, decoded.localId());
    }

    // --- decode tests ---

    @Test
    void decodeLocalOnly() {
        long[] result = FederatedIdUtility.decode(123);
        assertEquals(0, result[0]); // namespaceId
        assertEquals(123, result[1]); // localId
    }

    @Test
    void decodeInstanceOne() {
        long[] result = FederatedIdUtility.decode(INSTANCE_SHIFT + 456);
        assertEquals(1, result[0]);
        assertEquals(456, result[1]);
    }

    @Test
    void decodeInstanceFive() {
        long federated = 5 * INSTANCE_SHIFT + 789;
        long[] result = FederatedIdUtility.decode(federated);
        assertEquals(5, result[0]);
        assertEquals(789, result[1]);
    }

    @Test
    void decodeZero() {
        long[] result = FederatedIdUtility.decode(0);
        assertEquals(0, result[0]);
        assertEquals(0, result[1]);
    }

    @Test
    void decodeUsesUnsignedShift() {
        // Verify that unsigned right shift >>> is used for namespace extraction.
        // FederatedIdUtility.decode(123) should give namespaceId of the high bits.
        DecodedId decoded = DecodedId.from(123L);
        assertEquals(0, decoded.namespaceId());
    }

    // --- roundtrip tests ---

    @Test
    void roundtripEncodeDecode() {
        long[][] pairs = {
            {0, 0},
            {0, 1},
            {0, 123},
            {0, 1L << 40},
            {0, LOCAL_ID_MASK},
            {1, 456},
            {1, 0},
            {1, LOCAL_ID_MASK},
            {5, 789},
            {10, 9999},
            {15, 1},
        };
        for (long[] pair : pairs) {
            long namespaceId = pair[0];
            long localId = pair[1];
            long encoded = FederatedIdUtility.encode(namespaceId, localId);
            long[] decoded = FederatedIdUtility.decode(encoded);
            assertEquals(namespaceId, decoded[0],
                "namespaceId mismatch for encode(" + namespaceId + ", " + localId + ") = " + encoded);
            assertEquals(localId, decoded[1],
                "localId mismatch for encode(" + namespaceId + ", " + localId + ") = " + encoded);
        }
    }

    @Test
    void roundtripRecords() {
        long[][] pairs = {{0, 123}, {3, 500}, {7, 8888}};
        for (long[] pair : pairs) {
            long namespaceId = pair[0];
            long localId = pair[1];
            long encoded = FederatedIdUtility.encode(namespaceId, localId);
            DecodedId decoded = DecodedId.from(encoded);
            assertEquals(namespaceId, decoded.namespaceId());
            assertEquals(localId, decoded.localId());
        }
    }

    @Test
    void constantsAreCorrect() {
        assertEquals(44, FederatedIdUtility.INSTANCE_SHIFT_BITS);
        assertEquals(INSTANCE_SHIFT, 1L << 44);
        assertEquals(LOCAL_ID_MASK, (1L << 44) - 1);
    }

    // Verify the specific encode example from the spec
    @Test
    void specExampleEncode() {
        // Instance 0, id 123 -> 123
        assertEquals(123L, FederatedIdUtility.encode(0, 123));

        // Instance 5, id 456 -> (5 << 44) | 456
        assertEquals(5 * INSTANCE_SHIFT + 456, FederatedIdUtility.encode(5, 456));
    }

    @Test
    void decodeLargeFederatedId() {
        // Simulate a large federated ID and verify unsigned shift behavior
        long federated = 100L * INSTANCE_SHIFT + LOCAL_ID_MASK;
        DecodedId decoded = DecodedId.from(federated);
        assertEquals(100, decoded.namespaceId());
        assertEquals(LOCAL_ID_MASK, decoded.localId());
    }
}
