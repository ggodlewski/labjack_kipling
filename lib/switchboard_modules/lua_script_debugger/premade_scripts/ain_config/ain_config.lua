--[[
    Name: ain_config.lua
    Desc: This is an example showing how to configure analog input settings on
          T-Series devices.
--]]

-- Assign functions locally for faster processing
local modbus_read = MB.R
local modbus_write = MB.W
local interval_config = LJ.IntervalConfig
local check_interval = LJ.CheckInterval

-------------------------------------------------------------------------------
--  Desc: This function can be used to configure general analog input settings
--        such as range, resolution, and settling.  More information about
--        these settings can be found on the LabJack website under the AIN
--        section:
--          https://labjack.com/support/datasheets/t-series/ain
-------------------------------------------------------------------------------
local function ain_channel_config(ainchannel, range, resolution, settling, isdifferential)
  -- Set AIN range
  modbus_write(40000 + ainchannel * 2, 3, range)
  -- Set resolution index
  modbus_write(41500 + ainchannel * 1, 0, resolution)
  -- Set settling time
  modbus_write(42000 + ainchannel * 2, 3, settling)

  -- Read the device type
  local devicetype = modbus_read(60000, 3)
  -- Setup the negative channel if using a differential input
  if isdifferential and (ainchannel%2 == 0) and (devicetype == 7) then
    -- The negative channels setting is only valid for even
    -- analog input channels and is not valid for the T4.
    if (ainchannel < 14) then
      -- The negative channel is 1+ the channel for AIN0-13 on the T7
      modbus_write(41000 + ainchannel, 0, ainchannel + 1)
    elseif (ainchannel > 47) then
      -- The negative channel is 8+ the channel for AIN48-127 on the T7
      -- when using a Mux80.
      -- https://labjack.com/support/datasheets/accessories/mux80
      modbus_write(41000 + ainchannel, 0, ainchannel + 8)
    else
      print(string.format("Can not set negative channel for AIN%d",ainchannel))
    end
  end
end

print("Configure & Read Analog Input")
-- Use AIN0 and AIN1 for our analog inputs
local ainchannels = {0,1}
-- Use +/-10V for analog input range
local ainrange = 10
-- Resolution of 1 is the fastest setting
local ainresolution = 1
-- Use the default settling time
local ainsettling = 0

-- Configure each analog input
for i=1,table.getn(ainchannels) do
  ain_channel_config(ainchannels[i], ainrange, ainresolution, ainsettling)
end

interval_config(0, 500) -- Configure interval
while true do
  -- The interval is finished
  if check_interval(0) then
    -- Read & Print out each read AIN channel
    for i=1, table.getn(ainchannels) do
      local ainval = modbus_read(ainchannels[i] * 2, 3)
      print(string.format("AIN%d: %.3f", ainchannels[i], ainval))
    end
  end
end