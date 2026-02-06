-- KEYS[1]: 限流 key
-- ARGV[1]: 限制次数
-- ARGV[2]: 窗口时间（秒）

local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

-- 原子自增
local count = redis.call('INCR', key)

-- 如果是第一次访问，设置过期时间
if count == 1 then
    redis.call('EXPIRE', key, window)
end

-- 返回当前计数，由调用方判断是否超限
return count