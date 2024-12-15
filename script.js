document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('開始載入模型...');
        
        // 設定模型路徑
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';
        
        // 載入所有需要的模型
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        console.log('模型載入完成');

        const imageUpload = document.getElementById('imageUpload');
        const processBtn = document.getElementById('processBtn');
        const downloadBtn = document.getElementById('downloadBtn');
        const mosaicSize = document.getElementById('mosaicSize');
        const imageList = document.getElementById('imageList');
        const sizeLabel = document.querySelector('.size-label');
        const themeToggle = document.getElementById('themeToggle');

        let uploadedImages = [];

        // 主題切換
        themeToggle.addEventListener('click', () => {
            const html = document.documentElement;
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
        });

        // 載入已儲存的主題
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        // 更新馬賽克大小標籤
        mosaicSize.addEventListener('input', () => {
            sizeLabel.textContent = `${mosaicSize.value}px`;
        });

        // 處理圖片上傳
        imageUpload.addEventListener('change', (e) => {
            uploadedImages = [];
            imageList.innerHTML = '';
            
            const files = Array.from(e.target.files).filter(file => 
                file.type.startsWith('image/')
            );

            if (files.length > 0) {
                files.forEach((file, index) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.src = e.target.result;
                        img.onload = () => {
                            uploadedImages.push({
                                original: img,
                                processed: null,
                                index: index,
                                name: file.name
                            });

                            const div = document.createElement('div');
                            div.className = 'image-item';
                            div.innerHTML = `
                                <div class="image-preview">
                                    <div class="preview-original">
                                        <span class="preview-label">原始圖片</span>
                                        <img src="${e.target.result}" alt="原始圖片">
                                    </div>
                                    <div class="preview-processed">
                                        <span class="preview-label">處理後</span>
                                        <img src="${e.target.result}" alt="處理後圖片">
                                    </div>
                                </div>
                                <div class="image-name">${file.name}</div>
                            `;
                            imageList.appendChild(div);

                            if (uploadedImages.length === files.length) {
                                processBtn.disabled = false;
                            }
                        };
                    };
                    reader.readAsDataURL(file);
                });
            } else {
                alert('請選擇圖片檔案');
            }
        });

        // 使用多個模型進行人臉偵測
        async function detectFaces(image) {
            // 使用不同的模型和參數進行偵測
            const detectionsSSD = await faceapi.detectAllFaces(
                image,
                new faceapi.SsdMobilenetv1Options({ 
                    minConfidence: 0.3, // 降低信心閾值以提高偵測率
                    maxResults: 100 
                })
            ).withFaceLandmarks();

            const detectionsTiny = await faceapi.detectAllFaces(
                image,
                new faceapi.TinyFaceDetectorOptions({
                    inputSize: 512, // 增加輸入大小以提高準確度
                    scoreThreshold: 0.3
                })
            ).withFaceLandmarks();

            // 合併兩個模型的結果
            let allDetections = [...detectionsSSD, ...detectionsTiny];

            // 移除重複的偵測結果
            allDetections = allDetections.filter((detection, index) => {
                const box = detection.detection.box;
                const center = { x: box.x + box.width/2, y: box.y + box.height/2 };
                
                // 檢查是否與之前的偵測結果重疊
                for (let i = 0; i < index; i++) {
                    const otherBox = allDetections[i].detection.box;
                    const otherCenter = { 
                        x: otherBox.x + otherBox.width/2, 
                        y: otherBox.y + otherBox.height/2 
                    };
                    
                    const distance = Math.sqrt(
                        Math.pow(center.x - otherCenter.x, 2) + 
                        Math.pow(center.y - otherCenter.y, 2)
                    );
                    
                    if (distance < (box.width + otherBox.width) / 4) {
                        return false; // 移除重複的偵測
                    }
                }
                return true;
            });

            return allDetections;
        }

        // 處理圖片
        processBtn.addEventListener('click', async () => {
            try {
                processBtn.disabled = true;
                const size = parseInt(mosaicSize.value);

                for (let i = 0; i < uploadedImages.length; i++) {
                    const imgData = uploadedImages[i];
                    const canvas = document.createElement('canvas');
                    canvas.width = imgData.original.width;
                    canvas.height = imgData.original.height;
                    const ctx = canvas.getContext('2d');
                    
                    // 繪製原始圖片
                    ctx.drawImage(imgData.original, 0, 0);

                    // 使用改進的人臉偵測函數
                    const detections = await detectFaces(imgData.original);

                    if (detections.length > 0) {
                        // 為每個人臉套用馬賽克
                        detections.forEach(detection => {
                            const box = detection.detection.box;
                            // 擴大偵測區域以確保覆蓋整個臉部
                            const x = Math.max(0, box.x - box.width * 0.2);
                            const y = Math.max(0, box.y - box.height * 0.2);
                            const width = Math.min(canvas.width - x, box.width * 1.4);
                            const height = Math.min(canvas.height - y, box.height * 1.4);
                            
                            // 使用更小的馬賽克大小來提高效果
                            const mosaicSize = Math.max(3, Math.floor(size * 0.8));
                            
                            for (let px = x; px < x + width; px += mosaicSize) {
                                for (let py = y; py < y + height; py += mosaicSize) {
                                    const pixelData = ctx.getImageData(
                                        Math.floor(px), 
                                        Math.floor(py), 
                                        1, 
                                        1
                                    ).data;
                                    ctx.fillStyle = `rgb(${pixelData[0]},${pixelData[1]},${pixelData[2]})`;
                                    ctx.fillRect(
                                        Math.floor(px), 
                                        Math.floor(py), 
                                        mosaicSize, 
                                        mosaicSize
                                    );
                                }
                            }
                        });
                        console.log(`在圖片 ${imgData.name} 中偵測到 ${detections.length} 個人臉`);
                    } else {
                        console.log(`在圖片 ${imgData.name} 中未偵測到人臉`);
                        alert(`在圖片 "${imgData.name}" 中未偵測到人臉，請確保人臉清晰可見`);
                    }

                    // 更新預覽圖
                    uploadedImages[i].processed = canvas.toDataURL('image/jpeg');
                    const processedImg = imageList.children[i].querySelector('.preview-processed img');
                    processedImg.src = uploadedImages[i].processed;
                }

                processBtn.disabled = false;
                downloadBtn.disabled = false;
            } catch (error) {
                console.error('處理圖片失敗:', error);
                alert('處理圖片失敗，請檢查圖片格式和大小');
                processBtn.disabled = false;
            }
        });

        // 下載處理後的圖片
        downloadBtn.addEventListener('click', () => {
            try {
                uploadedImages.forEach((imgData) => {
                    if (imgData.processed) {
                        const link = document.createElement('a');
                        const fileName = imgData.name.replace(/\.[^/.]+$/, '') + '_mosaic.jpg';
                        link.download = fileName;
                        link.href = imgData.processed;
                        link.click();
                    }
                });
            } catch (error) {
                console.error('下載圖片失敗:', error);
                alert('下載圖片失敗，請檢查網路連接');
            }
        });

    } catch (error) {
        console.error('初始化失敗:', error);
        alert('初始化失敗，請確保網路連接正常並重新整理頁面');
    }
});
