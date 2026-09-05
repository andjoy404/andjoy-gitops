package com.gitlabops.config;

import jakarta.annotation.PostConstruct;
import org.jooq.DSLContext;
import org.jooq.impl.DSL;
import org.jooq.impl.SQLDataType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.gitlabops.service.AuthService;

import static org.jooq.impl.DSL.currentTimestamp;
import static org.jooq.impl.DSL.field;
import static org.jooq.impl.DSL.inline;
import static org.jooq.impl.DSL.name;
import static org.jooq.impl.DSL.table;

@Component
public class InitialAdminBootstrapper {

    private static final Logger log = LoggerFactory.getLogger(InitialAdminBootstrapper.class);
    private static final String TABLE = "app_users";
    private static final String DEFAULT_USERNAME = "admin";
    private static final String DEFAULT_PASSWORD = "admin";
    private static final String DEFAULT_DISPLAY_NAME = "Administrator";
    private static final String DEFAULT_EMAIL = "admin@localhost";
    private static final String DEFAULT_ROLE = "admin";

    private final DSLContext dsl;
    private final AuthService authService;

    InitialAdminBootstrapper(DSLContext dsl, AuthService authService) {
        this.dsl = dsl;
        this.authService = authService;
    }

    @PostConstruct
    void bootstrap() {
        int count = dsl.selectCount().from(table(TABLE)).fetchOne(0, int.class);
        if (count > 0) {
            log.info("app_users already has {} row(s); skipping bootstrap", count);
            return;
        }
        log.warn("Creating bootstrap admin. Login as '{}', then change the password immediately.", DEFAULT_USERNAME);
        String hash = authService.hashPassword(DEFAULT_PASSWORD);
        dsl.insertInto(table(TABLE))
            .columns(field(name("username")),
                     field(name("password_hash")),
                     field(name("display_name")),
                     field(name("email")),
                     field(name("role")),
                     field(name("enabled")),
                     field(name("must_change_password")),
                     field(name("created_at")),
                     field(name("updated_at")))
            .values(DEFAULT_USERNAME,
                    hash,
                    DEFAULT_DISPLAY_NAME,
                    DEFAULT_EMAIL,
                    DEFAULT_ROLE,
                    inline(true, SQLDataType.BOOLEAN),
                    inline(true, SQLDataType.BOOLEAN),
                    currentTimestamp(),
                    currentTimestamp())
            .execute();
        log.info("Bootstrap administrator created.", DEFAULT_USERNAME);
    }
}
