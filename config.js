window.APP_CONFIG = {
  csv: {
    jobSummary: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDJpVhDIqrUpNzfndBiUgglqcwntRKpa0KTB3JlJ8qSLkKS48zuDarbbK9PyJZvu8RvncRTSEDWdLt/pub?gid=980550514&single=true&output=csv",
    prefectureSalary: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDJpVhDIqrUpNzfndBiUgglqcwntRKpa0KTB3JlJ8qSLkKS48zuDarbbK9PyJZvu8RvncRTSEDWdLt/pub?gid=1869601362&single=true&output=csv",
    monthlyJobs: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDJpVhDIqrUpNzfndBiUgglqcwntRKpa0KTB3JlJ8qSLkKS48zuDarbbK9PyJZvu8RvncRTSEDWdLt/pub?gid=478230424&single=true&output=csv",
    conditionSalary: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQDJpVhDIqrUpNzfndBiUgglqcwntRKpa0KTB3JlJ8qSLkKS48zuDarbbK9PyJZvu8RvncRTSEDWdLt/pub?gid=1107626536&single=true&output=csv"
  },
  json: {
    classification: "./data/classification.json",
    tags: "./data/tags.json",
    relations: "./data/relations.json"
  },
  loader: {
    requestTimeoutMs: 10000,
    retries: 3,
    retryBaseDelayMs: 700,
    csvConcurrency: 2,
    cacheName: "job-market-navi-market-v1",
    cacheMetaKey: "job-market-navi-market-cache-meta-v1"
  },
  defaultExpandLevel: 2
};
