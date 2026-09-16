# Quy Trình Tự Động Hóa Bitrix24 (Workflows)

Thư mục này chứa các file quy trình nghiệp vụ (`.bpt`) và tài liệu đặc tả chi tiết phục vụ bài kiểm tra Workflow trên Bitrix24. Chi tiết cấu hình từng khối, danh sách biến, hằng số và ảnh chụp màn hình minh họa được trình bày đầy đủ trong file [DOCS.pdf](./DOCS.pdf).

---

## 1. Quy Trình Nghỉ Phép 3 Cấp (NghiPhep_3Cap.bpt)

### Vai trò phê duyệt:
- Cấp 1: Quản lý trực tiếp (lấy động theo cơ cấu tổ chức phòng ban của người tạo đơn qua `GetUserActivity`).
- Cấp 2: Trưởng phòng Nhân sự (Hằng số mẫu `HR_MANAGER`).
- Cấp 3: Giám đốc (Hằng số mẫu `CEO_DIRECTOR`).

### Luồng xử lý (Flow):
1. Nhân viên gửi đơn xin nghỉ phép.
2. **Cấp 1 - Quản lý trực tiếp (Vòng lặp While):**
   - Quản lý xem xét đơn:
     - Đồng ý: Gán `managerStatus = APPROVED`, thoát vòng lặp Cấp 1, chuyển tiếp sang Cấp 2.
     - Từ chối: Kiểm tra số lần sửa (`managerRetryCount < 2`):
       - Nếu vượt quá số lần cho phép: Đơn bị từ chối dứt điểm (`managerStatus = REJECTED`), kết thúc quy trình.
       - Nếu còn lượt sửa (tối đa 1 lần sửa đổi): Mở form cho nhân viên cập nhật lại thông tin (ngày bắt đầu, ngày kết thúc, loại nghỉ, lý do).
         - Nhân viên chọn "Hủy đơn": Gán `managerStatus = REJECTED`, kết thúc quy trình.
         - Nhân viên chọn "Cập nhật đơn": Ghi đè dữ liệu mới vào đơn, tăng biến đếm `managerRetryCount` và quay lại đầu vòng lặp để Quản lý duyệt lại với dữ liệu mới.
3. **Cấp 2 - Trưởng phòng Nhân sự (Vòng lặp While):**
   - Kiểm tra tính hợp lệ và số ngày phép khả dụng:
     - Đồng ý: Gán `hrStatus = APPROVED`, thoát vòng lặp Cấp 2, chuyển tiếp sang Cấp 3.
     - Từ chối: Hỗ trợ nhân viên chỉnh sửa đơn tối đa 1 lần tương tự Cấp 1 để HR thẩm định lại.
4. **Cấp 3 - Giám đốc (Vòng lặp While):**
   - Phê duyệt cuối cùng:
     - Đồng ý: Cập nhật lịch vắng mặt (Absence Chart), trừ ngày phép tồn, gửi thông báo thành công và hoàn tất quy trình.
     - Từ chối: Hỗ trợ nhân viên chỉnh sửa/giải trình tối đa 1 lần để Giám đốc xem xét lại hoặc bác bỏ hoàn toàn.
5. **Lưu vết & Thông báo:** Mọi bước duyệt, yêu cầu sửa đổi, cập nhật thông tin và từ chối đều tự động ghi log (Audit Trail) và gửi thông báo trực tiếp cho nhân viên.

---

## 2. Quy Trình Chi Phí Công Tác 4 Cấp (ChiPhiCongTac_4Cap.bpt)

### Vai trò phê duyệt:
- Cấp 1: Quản lý trực tiếp (lấy động theo cơ cấu tổ chức qua `GetUserActivity`).
- Cấp 2: Trưởng phòng Tài chính (Hằng số mẫu `FINANCE_MANAGER`).
- Cấp 3: Phó Giám đốc Tài chính (Hằng số mẫu `VICE_FINANCE_DIRECTOR`).
- Cấp 4: Giám đốc (Hằng số mẫu `CEO_DIRECTOR`).

### Luồng xử lý (Flow):
1. Nhân viên gửi đề xuất chi phí công tác (đính kèm thời gian, địa điểm, dự toán chi phí chi tiết).
2. **Cấp 1 - Quản lý trực tiếp (Vòng lặp While):**
   - Xem xét tính cần thiết của chuyến công tác:
     - Đồng ý: Chuyển tiếp sang Cấp 2.
     - Từ chối: Mở form cho nhân viên chỉnh sửa thông tin/dự toán tối đa 1 lần để Quản lý duyệt lại. Nếu nhân viên hủy hoặc hết lượt sửa thì kết thúc đơn.
3. **Cấp 2 - Trưởng phòng Tài chính (Vòng lặp While):**
   - Kiểm tra ngân sách phòng ban và định mức chi phí:
     - Nếu chi phí chưa hợp lý hoặc cần điều chỉnh: Yêu cầu nhân viên cập nhật lại chi tiết chi phí/tổng tiền (tối đa 1 lần) để Tài chính thẩm định lại.
     - Nếu hợp lệ: Chuyển tiếp sang Cấp 3.
4. **Cấp 3 - Phó Giám đốc Tài chính (Vòng lặp While):**
   - Đánh giá tính hợp lý và hiệu quả ngân sách:
     - Đồng ý: Chuyển tiếp sang Cấp 4.
     - Từ chối: Hỗ trợ nhân viên điều chỉnh lại dự toán tối đa 1 lần để duyệt lại.
5. **Cấp 4 - Giám đốc (Vòng lặp While):**
   - Quyết định phê duyệt kinh phí cuối cùng:
     - Đồng ý: Trừ ngân sách khả dụng, thêm lịch vào Biểu đồ vắng mặt, gửi thông báo chi tiết kinh phí được duyệt.
     - Từ chối: Gửi thông báo kèm lý do từ chối và kết thúc quy trình.
6. **Lưu vết & Thông báo:** Mọi nhánh xử lý đều có khối ghi lịch sử (Audit Trail) và gửi thông báo tự động.

---

## 3. Phân Quyền Quy Trình (Permissions)

Cả hai quy trình được đóng gói ma trận quyền chuẩn trong file `.bpt`:
- Thêm mới (Create): Nhóm Nhân viên (`group_11` / All Employees).
- Đọc (Read): Tác giả đơn (`author`).
- Sửa (Write): Tác giả đơn (`author`) - phục vụ quyền cập nhật dữ liệu khi có yêu cầu chỉnh sửa.
- Quản trị (Admin): Quản trị viên (`group_g1`).
