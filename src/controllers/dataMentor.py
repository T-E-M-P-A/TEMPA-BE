# dataMentor.py
import sys
import json
from pddiktipy import api

def validate_mentor(nik):
    """Mencari data dosen berdasarkan NIK dan mencetak hasilnya dalam format JSON."""
    try:
        # 1. Gunakan context manager 'api'
        with api() as client:
            # 2. Gunakan metode search_dosen() dengan NIK sebagai keyword
            results = client.search_dosen(nik) 
        
            output = []
            if results:
                for r in results:
                    # Ambil data yang diperlukan dari setiap dictionary hasil
                    output.append({
                        'id': r.get('id'),
                        'nama': r.get('nama'),
                        'nidn': r.get('nidn'),
                        'terdaftar': r.get('terdaftar'),
                    })
            
            # 3. Cetak JSON ke stdout untuk Express.js
            print(json.dumps({'status': 'success', 'data': output}))

    except Exception as e:
        print(json.dumps({'status': 'error', 'message': f'Error PDDIKTI: {str(e)}'}))
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({'status': 'error', 'message': 'NIK mentor tidak disediakan.'}))
        sys.exit(1)

    mentor_nik = sys.argv[1]
    validate_mentor(mentor_nik)
