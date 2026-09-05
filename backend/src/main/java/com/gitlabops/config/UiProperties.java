package com.gitlabops.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.Arrays;
import java.util.List;

@ConfigurationProperties(prefix = "ui")
public class UiProperties {

    private boolean readOnly;
    private boolean hideWriteActions;
    private List<Integer> pageSizeOptions = Arrays.asList(15, 25, 50);
    private int defaultPageSize = 25;

    public boolean isReadOnly() { return readOnly; }
    public void setReadOnly(boolean readOnly) { this.readOnly = readOnly; }

    public boolean isHideWriteActions() { return hideWriteActions; }
    public void setHideWriteActions(boolean hideWriteActions) { this.hideWriteActions = hideWriteActions; }

    public List<Integer> getPageSizeOptions() { return pageSizeOptions; }
    public void setPageSizeOptions(List<Integer> pageSizeOptions) { this.pageSizeOptions = pageSizeOptions; }

    public int getDefaultPageSize() { return defaultPageSize; }
    public void setDefaultPageSize(int defaultPageSize) { this.defaultPageSize = defaultPageSize; }
}
