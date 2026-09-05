package com.gitlabops.repository;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.jooq.DSLContext;
import org.springframework.stereotype.Repository;

import static org.jooq.impl.DSL.currentTimestamp;
import static org.jooq.impl.DSL.field;
import static org.jooq.impl.DSL.name;
import static org.jooq.impl.DSL.table;
import static org.jooq.impl.DSL.val;

@Repository
public class PreferencesRepository {

    private static final String TABLE = "app_user_preferences";
    private final DSLContext dsl;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PreferencesRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public String getTheme(Long userId) {
        try {
            String theme = dsl
                .select(field(name("theme")))
                .from(table(TABLE))
                .where(field(name("user_id")).eq(userId))
                .fetchOne(field(name("theme"), String.class));
            return theme != null ? theme : "light";
        } catch (Exception e) {
            return "light";
        }
    }

    public void saveTheme(Long userId, String theme) {
        if (!"light".equals(theme) && !"dark".equals(theme)) {
            throw new IllegalArgumentException("Theme must be 'light' or 'dark'");
        }
        try {
            dsl.insertInto(table(TABLE), field(name("user_id")), field(name("theme")))
                .values(val(userId), val(theme))
                .onConflict(field(name("user_id")))
                .doUpdate()
                .set(field(name("theme")), val(theme))
                .set(field(name("updated_at")), currentTimestamp())
                .execute();
        } catch (Exception e) {
            throw new RuntimeException("Failed to save theme preference", e);
        }
    }

    public ObjectNode getFavorites(Long userId) {
        try {
            String json = dsl
                .select(field(name("favorite_projects")))
                .from(table(TABLE))
                .where(field(name("user_id")).eq(userId))
                .fetchOne(field(name("favorite_projects"), String.class));
            if (json != null && !json.isEmpty()) {
                return (ObjectNode) objectMapper.readTree(json);
            }
        } catch (Exception ignored) {}
        return objectMapper.createObjectNode();
    }

    public void saveFavorites(Long userId, ObjectNode favoriteProjects) {
        String json = favoriteProjects.toString();
        try {
            dsl.insertInto(table(TABLE), field(name("user_id")), field(name("favorite_projects")))
                .values(val(userId), val(json))
                .onConflict(field(name("user_id")))
                .doUpdate()
                .set(field(name("favorite_projects")), val(json))
                .set(field(name("updated_at")), currentTimestamp())
                .execute();
        } catch (Exception e) {
            throw new RuntimeException("Failed to save favorites", e);
        }
    }
}
