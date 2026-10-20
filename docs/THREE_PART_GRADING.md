# Chấm phiếu TN - DO 2026 ba phần

Áp dụng migration `supabase/migrations/202610200002_three_part_grading.sql` sau các migration trước đó, rồi deploy frontend. Trong cửa sổ tạo kỳ thi hoặc thư viện mẫu, quản trị viên bấm **Bổ sung mẫu phiếu TN - DO còn thiếu** để thêm phiên bản v2. Kỳ thi đã dùng v1 vẫn giữ nguyên cấu hình và lịch sử điểm.

Chọn **TN - DO 2026 · v2**, bấm **Thêm phần II và III**, rồi nhập đáp án. Cấu hình ban đầu phân bổ 30% điểm cho phần I, 40% cho phần II và 30% cho phần III. Có thể đổi số câu và điểm mỗi câu; tổng điểm từng mã đề phải bằng thang điểm.

- Phần I: tối đa 40 câu A–D.
- Phần II: tối đa 8 câu, mỗi câu bốn ý a–d. Mặc định đúng 1/2/3/4 ý được 10%/25%/50%/100% điểm tối đa của câu. Có thể chuyển sang chia đều cho bốn ý. Ý bỏ trống không được tính là đúng.
- Phần III: tối đa 6 câu, mỗi câu bốn cột chữ số. Hỗ trợ số âm và dấu thập phân; các chữ số phải liên tiếp. Tô dấu âm và dấu thập phân ở hàng riêng. Không tô một chữ số ở nhiều ô cùng cột.

SBD gồm 8 chữ số, mã đề gồm 4 chữ số. Khai báo đúng cả số 0 ở đầu, ví dụ `0101`. Chọn **Sửa mã đề** để sửa mã mặc định khi cần.

Trong JSON và tệp nhập, câu phần I dùng số 1–40, phần II dùng số nội bộ 41–48 (hiển thị II.1–II.8), phần III dùng 49–54 (hiển thị III.1–III.6). Mỗi phần có thể ít câu hơn sức chứa phiếu, bắt đầu từ câu đầu của phần. Đúng–sai lưu bằng bốn ký tự T/F, ví dụ `TFTF`; trả lời ngắn lưu bằng chuỗi số, ví dụ `-1.25`. Dấu phẩy và dấu chấm thập phân được chấp nhận, số 0 thừa được chuẩn hóa khi chấm.

Tab Excel/CSV tải mẫu theo cấu hình hiện tại, giữ điểm và cách chấm từng phần. Cột câu dùng `II.1`, `III.1`; đáp án đúng–sai nhận `TFTF` hoặc `ĐSĐS`. Cần nhập đủ câu đã cấu hình; tệp thiếu câu sẽ không được áp dụng.

Phiếu không có QR cần chọn **Cho phép không có QR**. Ô mờ, tô kép, chữ số bị ngắt quãng hoặc dấu thập phân sai vị trí phải được xác minh. Có thể sửa từng ý đúng–sai và từng số trên màn hình chấm trước khi lưu. Supabase tự tính điểm từ đáp án được phân quyền, không nhận điểm do trình duyệt gửi làm kết quả chính thức. Chấm lại giữ lịch sử điểm cũ.

## Chụp và chấm liên tục bằng điện thoại

Trong **Chấm phiếu → chọn kỳ thi → Chụp bằng camera**, cho phép trình duyệt sử dụng camera. Camera sau mở ngay trong trang, kèm 4 ô vuông định vị theo mẫu phiếu đã chọn. Đưa 4 ô đen của giấy vào khung; từng ô chuyển xanh khi khớp. Giữ phiếu phẳng, ánh sáng đều và máy ổn định khoảng một giây để tự chụp.

Ứng dụng tự căn chỉnh, đọc QR (nếu có), SBD, mã đề và các câu thuộc kỳ thi. Khi xác định được một học sinh, mã đề hợp lệ và không có câu cần xác minh, ứng dụng tự chấm và lưu ảnh gốc, ảnh xử lý cùng kết quả. Camera tiếp tục mở; đưa phiếu vừa chấm ra khỏi khung ít nhất khoảng một giây rồi đặt phiếu tiếp theo vào. Không chụp lại cùng một phiếu khi vẫn giữ trong khung; bài của học sinh đã lưu hoặc đang chờ đồng bộ sẽ bị chặn lưu trùng.

Camera trực tiếp cho phép phiếu không có QR nếu đọc rõ SBD và mã đề. QR sai kỳ thi/phiên bản hoặc thông tin QR không khớp ô tô vẫn bị chặn. Thiếu SBD, mã đề hoặc có ô tô nghi ngờ thì camera dừng và mở phần xác minh. Chỉnh thông tin/câu trả lời rồi **Xác nhận & lưu kết quả** để tự quay lại camera; đưa phiếu cũ ra khỏi khung trước khi chấm tiếp.

Nếu lưu lên máy chủ thất bại, ảnh và kết quả đã nhận diện được giữ trong bản chờ trên thiết bị, camera dừng để người dùng kiểm tra. Gửi lại ở **Kết nối & đồng bộ**. Camera trực tiếp cần HTTPS (hoặc localhost khi phát triển); nếu thiếu quyền hoặc trình duyệt không hỗ trợ, dùng **Dùng camera hệ thống** hoặc chọn ảnh từ thiết bị. Luồng chọn ảnh vẫn nhận diện và xác nhận lưu thủ công như trước. Không cần migration mới cho tính năng camera này.

Kiểm tra: `npm run test:camera` chạy camera giả lập bằng luồng video canvas trong Chromium nhưng dùng OpenCV, OMR và IndexedDB thực tế; kiểm tra lệch khung, chụp tự động, lưu ảnh/điểm, không chụp lặp, chấm phiếu tiếp, xác minh thủ công và giải phóng camera. Cần kiểm tra thêm camera thật trên Safari iPhone và Chrome Android trước khi triển khai rộng.
