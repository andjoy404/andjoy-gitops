package com.gitlabops.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.List;

/**
 * UI configuration properties, bound to the "ui." prefix.
 *
 * Environment variables mapped via Spring Boot's relaxed binding:
 *
 *  ui.page-size-options  →  UI_PAGE_SIZE_OPTIONS (comma-separated, e.g. "10,20,50,100")
 *  ui.default-page-size  →  UI_DEFAULT_PAGE_SIZE (e.g. "10")
 *  ui.show-all-option    →  UI_SHOW_ALL_OPTION ("true"/"false")
 *
 * When UI_SHOW_ALL_OPTION is true, the front-end pager also exposes an "All"
 * option that requests unlimited rows from the backend (page_size = -1).
 * Set it to false to hide the option entirely.
 */
@ConfigurationProperties(prefix = "ui")
public class UiProperties {

    private boolean readOnly;
    private boolean hideWriteActions;
    private List<Integer> pageSizeOptions = Arrays.asList(10, 20, 50, 100);
    private int defaultPageSize = 25;
    private boolean showAllOption = true;

    public boolean isReadOnly() { return readOnly; }
    public void setReadOnly(boolean readOnly) { this.readOnly = readOnly; }

    public boolean isHideWriteActions() { return hideWriteActions; }
    public void setHideWriteActions(boolean hideWriteActions) { this.hideWriteActions = hideWriteActions; }

    public List<Integer> getPageSizeOptions() { return pageSizeOptions; }
    public void setPageSizeOptions(List<Integer> pageSizeOptions) { this.pageSizeOptions = pageSizeOptions; }

    public int getDefaultPageSize() { return defaultPageSize; }
    public void setDefaultPageSize(int defaultPageSize) { this.defaultPageSize = defaultPageSize; }

    public boolean isShowAllOption() { return showAllOption; }
    public void setShowAllOption(boolean showAllOption) { this.showAllOption = showAllOption; }
}
