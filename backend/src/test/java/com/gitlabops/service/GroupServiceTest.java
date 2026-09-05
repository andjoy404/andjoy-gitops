package com.gitlabops.service;

import com.gitlabops.model.dto.GroupDTO;
import com.gitlabops.repository.EnvironmentRepository;
import com.gitlabops.util.FederatedIdUtility;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.client.WireMock;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GroupServiceTest {

    private WireMockServer gitlab;
    private EnvironmentRepository repository;

    @BeforeEach
    void setUp() {
        gitlab = new WireMockServer(WireMockConfiguration.options().dynamicPort());
        gitlab.start();
        repository = mock(EnvironmentRepository.class);
    }

    @AfterEach
    void tearDown() {
        gitlab.stop();
    }

    @Test
    void fetchesConfiguredGroupsDirectlyWithoutEnumeratingTheInstance() {
        long nativeGroupId = 9529747L;
        when(repository.getEnabledClients()).thenReturn(List.of(client(nativeGroupId)));
        gitlab.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/groups/" + nativeGroupId))
            .willReturn(WireMock.okJson("{\"id\":9529747,\"name\":\"example-org\",\"full_path\":\"example-org\"}")));

        List<GroupDTO> groups = new GroupService(repository).getAllGroups();

        assertEquals(1, groups.size());
        assertEquals(FederatedIdUtility.encode(1, nativeGroupId), groups.get(0).getId());
        assertEquals("example-org", groups.get(0).getFullPath());
        gitlab.verify(1, WireMock.getRequestedFor(WireMock.urlPathEqualTo("/api/v4/groups/" + nativeGroupId)));
        gitlab.verify(0, WireMock.getRequestedFor(WireMock.urlPathEqualTo("/api/v4/groups")));
    }

    @Test
    void reportsConfiguredGroupFetchFailureInsteadOfReturningAnEmptyEnvironment() {
        long nativeGroupId = 9529747L;
        when(repository.getEnabledClients()).thenReturn(List.of(client(nativeGroupId)));
        gitlab.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/groups/" + nativeGroupId))
            .willReturn(WireMock.serverError()));

        assertThrows(IllegalStateException.class, () -> new GroupService(repository).getAllGroups());
    }

    @Test
    void invalidationDropsAnEmptySnapshotCreatedBeforeTheFirstEnvironment() {
        long nativeGroupId = 90L;
        when(repository.getEnabledClients())
            .thenReturn(List.of())
            .thenReturn(List.of(client(nativeGroupId)));
        gitlab.stubFor(WireMock.get(WireMock.urlPathEqualTo("/api/v4/groups/" + nativeGroupId))
            .willReturn(WireMock.okJson("{\"id\":90,\"name\":\"platform\",\"full_path\":\"example-org/platform\"}")));

        GroupService service = new GroupService(repository);
        assertEquals(0, service.getAllGroups().size());

        service.invalidateCache();

        assertEquals(1, service.getAllGroups().size());
        assertEquals("example-org/platform", service.getAllGroups().get(0).getFullPath());
    }

    private EnvironmentRepository.EnvironmentClientConfig client(long groupId) {
        return new EnvironmentRepository.EnvironmentClientConfig(
            10L, 1, "GitLab", gitlab.baseUrl(), "test-token", List.of(groupId), true, false);
    }
}
