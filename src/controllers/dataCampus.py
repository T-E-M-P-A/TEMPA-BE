# dataCampus.py (Struktur yang Benar Berdasarkan Hasil Colab)
import sys
import json
from pddiktipy import api # <<< Menggunakan 'api' huruf kecil
# from pprint import pprint # Tidak dibutuhkan untuk produksi

def validate_campus(campus_name):
    """Mencari data kampus dan mencetak hasilnya dalam format JSON."""
    try:
        # 1. Gunakan context manager 'api'
        with api() as client:
            # 2. Gunakan metode dan keyword dari Node.js
            results = client.search_pt(campus_name) 
        
            output = []
            if results:
                for r in results:
                    # Ambil data yang diperlukan dari setiap dictionary hasil
                    output.append({
                        'id': r['id'],
                        'kode': r['kode'],
                        'nama': r['nama'],
                        'nama_singkat': r['nama_singkat'],
                        # Tambahkan field lain jika diperlukan
                    })
            
            # 3. Cetak JSON ke stdout untuk Express.js
            print(json.dumps({'status': 'success', 'data': output}))

    except Exception as e:
        # Tangani error PDDIKTI dan cetak JSON error
        print(json.dumps({'status': 'error', 'message': f'Error PDDIKTI: {str(e)}'}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({'status': 'error', 'message': 'Nama kampus tidak disediakan.'}))
        sys.exit(1)

    # Ambil keyword yang dikirim dari Node.js
    campus_name = sys.argv[1]
    validate_campus(campus_name)