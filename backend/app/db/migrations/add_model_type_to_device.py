"""
資料庫遷移腳本：為 device 表添加 model_type 字段
執行此腳本以添加 model_type 欄位到現有的 device 表
"""

import asyncio
import sys
import os

# 添加專案根目錄到 Python 路徑
sys.path.append(os.path.join(os.path.dirname(__file__), '../../../'))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.db.base import async_session_maker


async def add_model_type_column():
    """添加 model_type 欄位到 device 表"""
    async with async_session_maker() as session:
        try:
            # 檢查是否已經存在 model_type 欄位
            check_column_query = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'device' AND column_name = 'model_type'
            """)
            
            result = await session.execute(check_column_query)
            existing_column = result.fetchone()
            
            if existing_column:
                print("model_type 欄位已經存在，跳過遷移")
                return
            
            # 添加 model_type 欄位
            add_column_query = text("""
                ALTER TABLE device 
                ADD COLUMN model_type VARCHAR(50) DEFAULT NULL
            """)
            
            await session.execute(add_column_query)
            await session.commit()
            
            print("成功添加 model_type 欄位到 device 表")
            
            # 為現有的 desired 設備設置默認值為 'tower'
            update_existing_query = text("""
                UPDATE device 
                SET model_type = 'tower' 
                WHERE role = 'desired' AND model_type IS NULL
            """)
            
            await session.execute(update_existing_query)
            await session.commit()
            
            print("已為現有的 TX 設備設置默認模型類型為 'tower'")
            
        except Exception as e:
            await session.rollback()
            print(f"遷移失敗: {e}")
            raise


if __name__ == "__main__":
    asyncio.run(add_model_type_column())