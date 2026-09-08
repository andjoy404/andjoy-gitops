package com.gitlabops.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnalyticsWildcardSearchTest {

    @Test
    void testPlainSubstring() {
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("Imron Rosyadi", "imron"));
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("Imron Rosyadi", "rosyadi"));
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("@imron.rosyadi", "imron"));
        assertFalse(AnalyticsService.matchesWildcardOrSubstring("Imron Rosyadi", "john"));
    }

    @Test
    void testWildcardPrefixAndSuffix() {
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("Imron Rosyadi", "im*"));
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("Imron Rosyadi", "*rosyadi"));
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("Imron Rosyadi", "*ron*"));
        assertFalse(AnalyticsService.matchesWildcardOrSubstring("Imron Rosyadi", "john*"));
    }

    @Test
    void testWildcardQuestionMark() {
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("alice", "al?ce"));
        assertFalse(AnalyticsService.matchesWildcardOrSubstring("alice", "al?e"));
    }

    @Test
    void testNullOrEmpty() {
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("anything", ""));
        assertTrue(AnalyticsService.matchesWildcardOrSubstring("anything", null));
        assertFalse(AnalyticsService.matchesWildcardOrSubstring(null, "search"));
    }
}

