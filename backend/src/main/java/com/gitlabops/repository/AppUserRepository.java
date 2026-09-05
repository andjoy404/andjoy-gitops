package com.gitlabops.repository;

import com.gitlabops.model.dto.AppUserDTO;
import org.jooq.DSLContext;
import org.jooq.Field;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;

import static org.jooq.impl.DSL.currentTimestamp;
import static org.jooq.impl.DSL.field;
import static org.jooq.impl.DSL.name;
import static org.jooq.impl.DSL.table;
import static org.jooq.impl.DSL.val;

@Repository
public class AppUserRepository {

    private final DSLContext dsl;
    private static final String TABLE = "app_users";

    public AppUserRepository(DSLContext dsl) {
        this.dsl = dsl;
    }

    public AppUserDTO findByUsername(String username) {
        return dsl
            .select(
                field(name("id")),
                field(name("username")),
                field(name("password_hash")),
                field(name("display_name")),
                field(name("email")),
                field(name("role")),
                field(name("enabled")),
                field(name("must_change_password"))
            )
            .from(table(TABLE))
            .where(field(name("username")).lower().eq(username.toLowerCase()))
            .and(field(name("enabled")).eq(true))
            .fetchOne(record -> {
                AppUserDTO user = new AppUserDTO();
                user.id = record.get("id", Long.class);
                user.username = record.get("username", String.class);
                user.passwordHash = record.get("password_hash", String.class);
                user.displayName = record.get("display_name", String.class);
                user.email = record.get("email", String.class);
                user.role = record.get("role", String.class);
                user.enabled = record.get("enabled", Boolean.class);
                user.mustChangePassword = record.get("must_change_password", Boolean.class);
                return user;
            });
    }

    public AppUserDTO findById(Long id) {
        return dsl
            .select(
                field(name("id")),
                field(name("username")),
                field(name("password_hash")),
                field(name("display_name")),
                field(name("email")),
                field(name("role")),
                field(name("enabled")),
                field(name("must_change_password"))
            )
            .from(table(TABLE))
            .where(field(name("id")).eq(id))
            .fetchOne(record -> {
                AppUserDTO user = new AppUserDTO();
                user.id = record.get("id", Long.class);
                user.username = record.get("username", String.class);
                user.passwordHash = record.get("password_hash", String.class);
                user.displayName = record.get("display_name", String.class);
                user.email = record.get("email", String.class);
                user.role = record.get("role", String.class);
                user.enabled = record.get("enabled", Boolean.class);
                user.mustChangePassword = record.get("must_change_password", Boolean.class);
                return user;
            });
    }

    public List<AppUserDTO> listAll() {
        var records = dsl
            .select(
                field(name("id")),
                field(name("username")),
                field(name("display_name")),
                field(name("email")),
                field(name("role")),
                field(name("enabled")),
                field(name("created_at"))
            )
            .from(table(TABLE))
            .orderBy(field(name("username")).lower().asc())
            .fetch();
        List<AppUserDTO> result = new ArrayList<>();
        for (var record : records) {
            AppUserDTO user = new AppUserDTO();
            user.id = record.get(field(name("id")), Long.class);
            user.username = record.get(field(name("username")), String.class);
            user.displayName = record.get(field(name("display_name")), String.class);
            user.email = record.get(field(name("email")), String.class);
            user.role = record.get(field(name("role")), String.class);
            user.enabled = record.get(field(name("enabled")), Boolean.class);
            user.created_at = record.get(field(name("created_at")), java.time.OffsetDateTime.class);
            result.add(user);
        }
        return result;
    }

    public Long create(String username, String passwordHash, String displayName, String email, String role, boolean enabled) {
        return dsl
            .insertInto(table(TABLE))
            .set(field(name("username")), username)
            .set(field(name("password_hash")), passwordHash)
            .set(field(name("display_name")), displayName)
            .set(field(name("email")), email)
            .set(field(name("role")), role)
            .set(field(name("enabled")), enabled)
            .set(field(name("created_at")), currentTimestamp())
            .set(field(name("updated_at")), currentTimestamp())
            .returning(field(name("id")))
            .fetchOne(field(name("id"), Long.class));
    }

    public void update(Long id, String username, String displayName, String email, String role, boolean enabled) {
        dsl
            .update(table(TABLE))
            .set(field(name("username")), username)
            .set(field(name("display_name")), displayName)
            .set(field(name("email")), email)
            .set(field(name("role")), role)
            .set(field(name("enabled")), enabled)
            .set(field(name("updated_at")), currentTimestamp())
            .where(field(name("id")).eq(id))
            .execute();
    }

    public void delete(Long id) {
        dsl
            .delete(table(TABLE))
            .where(field(name("id")).eq(id))
            .execute();
    }

    public void updatePassword(Long userId, String passwordHash) {
        dsl
            .update(table(TABLE))
            .set(field(name("password_hash")), passwordHash)
            .set(field(name("must_change_password")), false)
            .set(field(name("updated_at")), currentTimestamp())
            .where(field(name("id")).eq(userId))
            .execute();
    }

    public boolean canUserBeDeleted(Long id) {
        if (id == null) return false;
        // Check there's at least one other enabled admin besides possibly this user
        long adminCount = dsl
            .selectCount()
            .from(table(TABLE))
            .where(field(name("role")).eq("admin"))
            .and(field(name("enabled")).eq(true))
            .and(field(name("id")).ne(id))
            .fetchOne(0, int.class);
        return adminCount >= 1;
    }

    public int getEnabledAdminCount() {
        return dsl
            .selectCount()
            .from(table(TABLE))
            .where(field(name("role")).eq("admin"))
            .and(field(name("enabled")).eq(true))
            .fetchOne(0, int.class);
    }
}
