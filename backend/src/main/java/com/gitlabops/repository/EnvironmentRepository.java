package com.gitlabops.repository;

import com.gitlabops.model.dto.EnvironmentDTO;
import com.gitlabops.model.dto.GlobalConfigDTO;

import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

import javax.sql.DataSource;

import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import com.gitlabops.service.EncryptionService;

@Repository
public class EnvironmentRepository {

    @Autowired
    private EncryptionService encryptionService;

    private final DSLContext dsl;
    private final DataSource dataSource;
    private final JdbcTemplate jdbcTemplate;

    public EnvironmentRepository(DSLContext dsl, DataSource dataSource) {
        this.dsl = dsl;
        this.dataSource = dataSource;
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    public record EnvironmentClientConfig(
        long id,
        int index,
        String name,
        String url,
        String token,
        List<Long> groupIds,
        boolean onlyTopLevel,
        boolean includeSubgroups
    ) {}

    public List<EnvironmentClientConfig> getEnabledClients() {
        String sql = "SELECT id, namespace_id, name, base_url, token_ciphertext, group_ids, only_top_level, include_subgroups FROM gitlab_environments WHERE enabled = TRUE ORDER BY id";
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            byte[] tokenCipher = rs.getBytes("token_ciphertext");
            String decryptedToken = (tokenCipher != null) ? encryptionService.decrypt(tokenCipher) : null;
            Integer nsId = rs.getInt("namespace_id");
            return new EnvironmentClientConfig(
                rs.getLong("id"),
                (nsId != null) ? nsId : 0,
                rs.getString("name"),
                rs.getString("base_url"),
                decryptedToken,
                extractGroupIds(rs, "group_ids"),
                rs.getBoolean("only_top_level"),
                rs.getBoolean("include_subgroups")
            );
        });
    }

    @SuppressWarnings("unchecked")
    private List<Long> extractGroupIds(ResultSet rs, String col) throws SQLException {
        Array array = rs.getArray(col);
        if (array == null) return new ArrayList<>();
        Long[] objects = (Long[]) array.getArray();
        if (objects == null) return new ArrayList<>();
        return Arrays.stream(objects).filter(Objects::nonNull).toList();
    }

    @SuppressWarnings("unchecked")
    private List<Long> extractGroupIds(Object arrayObj) {
        if (!(arrayObj instanceof Array)) return new ArrayList<>();
        try {
            Array array = (Array) arrayObj;
            Long[] objects = (Long[]) array.getArray();
            if (objects == null) return new ArrayList<>();
            return Arrays.stream(objects).filter(Objects::nonNull).toList();
        } catch (SQLException e) {
            throw new RuntimeException("Failed to read PostgreSQL bigint array", e);
        }
    }

    private Instant extractInstant(Object value) {
        if (value == null) return null;
        if (value instanceof Instant i) return i;
        if (value instanceof Timestamp t) return t.toInstant();
        if (value instanceof Date d) return d.toInstant();
        return null;
    }

    public List<EnvironmentDTO> listAll() {
        String sql = "SELECT id, namespace_id, name, base_url, group_ids, enabled, only_top_level, include_subgroups, last_tested_at, last_error, is_default, token_ciphertext FROM gitlab_environments ORDER BY name";
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            return new EnvironmentDTO(
                rs.getLong("id"),
                rs.getInt("namespace_id"),
                rs.getString("name"),
                rs.getString("base_url"),
                extractGroupIds(rs, "group_ids"),
                rs.getBoolean("enabled"),
                rs.getBoolean("only_top_level"),
                rs.getBoolean("include_subgroups"),
                isTokenConfigured(rs.getObject("token_ciphertext")),
                extractInstant(rs.getObject("last_tested_at")),
                rs.getString("last_error"),
                rs.getBoolean("is_default")
            );
        });
    }

    public Optional<EnvironmentDTO> findById(long id) {
        String sql = "SELECT id, namespace_id, name, base_url, group_ids, enabled, only_top_level, include_subgroups, last_tested_at, last_error, is_default, token_ciphertext FROM gitlab_environments WHERE id = ?";
        List<EnvironmentDTO> results = jdbcTemplate.query(sql, (rs, rowNum) -> {
            return new EnvironmentDTO(
                rs.getLong("id"),
                rs.getInt("namespace_id"),
                rs.getString("name"),
                rs.getString("base_url"),
                extractGroupIds(rs, "group_ids"),
                rs.getBoolean("enabled"),
                rs.getBoolean("only_top_level"),
                rs.getBoolean("include_subgroups"),
                isTokenConfigured(rs.getObject("token_ciphertext")),
                extractInstant(rs.getObject("last_tested_at")),
                rs.getString("last_error"),
                rs.getBoolean("is_default")
            );
        }, id);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    private boolean isTokenConfigured(Object tokenCipher) {
        if (tokenCipher == null) {
            return false;
        }
        if (tokenCipher instanceof byte[] bytes) {
            return bytes.length > 0;
        }
        return false;
    }

    public long create(String name, String baseUrl, byte[] tokenCipher,
                       List<Long> groupIds, boolean enabled,
                       boolean onlyTopLevel, boolean includeSubgroups) {
        String pgArray = toPgArray(groupIds);
        String sql = "INSERT INTO gitlab_environments(namespace_id, name, base_url, token_ciphertext, group_ids, enabled, only_top_level, include_subgroups) VALUES ((SELECT COALESCE(MAX(namespace_id),-1)+1 FROM gitlab_environments), ?, ?, ?, CAST(? AS BIGINT[]), ?, ?, ?) RETURNING id";
        return jdbcTemplate.queryForObject(sql, Long.class, name.trim(), baseUrl, tokenCipher,
                pgArray, enabled, onlyTopLevel, includeSubgroups);
    }

    public void update(long id, String name, String baseUrl, byte[] tokenCipher,
                       List<Long> groupIds, boolean enabled,
                       boolean onlyTopLevel, boolean includeSubgroups) {
        String pgArray = toPgArray(groupIds);
        String sql = "UPDATE gitlab_environments SET name=?, base_url=?, token_ciphertext=?, group_ids=CAST(? AS BIGINT[]), enabled=?, only_top_level=?, include_subgroups=?, updated_at=NOW() WHERE id=?";
        jdbcTemplate.update(sql, name.trim(), baseUrl, tokenCipher, pgArray,
                enabled, onlyTopLevel, includeSubgroups, id);
    }

    public void updateWithoutToken(long id, String name, String baseUrl,
                                   List<Long> groupIds, boolean enabled,
                                   boolean onlyTopLevel, boolean includeSubgroups) {
        String pgArray = toPgArray(groupIds);
        String sql = "UPDATE gitlab_environments SET name=?, base_url=?, group_ids=CAST(? AS BIGINT[]), enabled=?, only_top_level=?, include_subgroups=?, updated_at=NOW() WHERE id=?";
        jdbcTemplate.update(sql, name.trim(), baseUrl, pgArray,
                enabled, onlyTopLevel, includeSubgroups, id);
    }

    public void deleteById(long id) {
        jdbcTemplate.update("DELETE FROM gitlab_environments WHERE id = ?", id);
    }

    public void setDefault(long id) {
        jdbcTemplate.update("UPDATE gitlab_environments SET is_default = FALSE WHERE is_default = TRUE");
        jdbcTemplate.update("UPDATE gitlab_environments SET is_default = TRUE WHERE id = ?", id);
    }

    public void saveGlobalConfig(String companyName, String companyLogo, String pipelineView) {
        String sql = "INSERT INTO app_global_settings(singleton, company_name, company_logo, pipeline_view) VALUES(TRUE, ?, ?, ?) ON CONFLICT(singleton) DO UPDATE SET company_name=EXCLUDED.company_name, company_logo=EXCLUDED.company_logo, pipeline_view=EXCLUDED.pipeline_view, updated_at=NOW()";
        jdbcTemplate.update(sql, companyName, companyLogo, pipelineView);
    }

    public Optional<GlobalConfigDTO> getGlobalConfig() {
        String sql = "SELECT company_name, company_logo, pipeline_view FROM app_global_settings WHERE singleton = TRUE";
        List<GlobalConfigDTO> results = jdbcTemplate.query(sql, (rs, rowNum) -> {
            String pv = rs.getString("pipeline_view");
            if (pv == null || pv.isEmpty()) {
                pv = "latest";
            }
            return new GlobalConfigDTO(
                rs.getString("company_name"),
                rs.getString("company_logo"),
                pv
            );
        });
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    public void setLastError(long id, String lastError) {
        String sql = "UPDATE gitlab_environments SET last_error = ?, last_tested_at = NOW() WHERE id = ?";
        jdbcTemplate.update(sql, lastError, id);
    }

    public void setLastTested(long id) {
        String sql = "UPDATE gitlab_environments SET last_tested_at = NOW(), last_error = NULL WHERE id = ?";
        jdbcTemplate.update(sql, id);
    }

    private String toPgArray(List<Long> values) {
        if (values == null || values.isEmpty()) {
            return "{}";
        }
        return "{" + String.join(",", values.stream().map(Object::toString).toList()) + "}";
    }
}
