from warehouse_classify import classify, employee_match_key


def test_classify():
    assert classify("总库") == "COMPANY"
    assert classify("米古里华为店") == "STORE"
    assert classify("铁路局电信营业厅") == "STORE"
    assert classify("中山李路远仓") == "STORE"
    assert classify("潘国杰售后") == "AFTER_SALES"
    assert classify("售后") == "AFTER_SALES"
    assert classify("支文香") == "PERSONAL"
    assert classify("马蕊红1") == "PERSONAL"
    assert classify("支文玉2") == "PERSONAL"
    assert classify("铁路局徐杰") == "PERSONAL"
    assert classify("移动何小妹") == "PERSONAL"
    assert classify("尚层空间") == "STORE"
    assert classify("外拓") == "STORE"
    assert employee_match_key("支文玉2") == "支文玉"
    assert employee_match_key("马蕊红1") == "马蕊红"
    print("warehouse_classify ok")


if __name__ == "__main__":
    test_classify()
